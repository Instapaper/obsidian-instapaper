import { Keymap, Notice, Plugin, TFolder } from 'obsidian';
import { InstapaperAccount, InstapaperAPI } from './api'
import { DEFAULT_SETTINGS, InstapaperPluginSettings, InstapaperSettingTab } from './settings'
import { syncNotes } from './notes';
import mergeOptions from 'merge-options';

type SyncResult = {
	notes: number
}

export default class InstapaperPlugin extends Plugin {
	settings: InstapaperPluginSettings;
	api: InstapaperAPI;
	syncInterval?: number;
	syncInProgress = false;

	async onload() {
		this.api = new InstapaperAPI(
			process.env.INSTAPAPER_CONSUMER_KEY as string,
			process.env.INSTAPAPER_CONSUMER_SECRET as string,
		);

		await this.loadSettings();
		this.addSettingTab(new InstapaperSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('url-menu', (menu, url) => {
				const token = this.settings.token;
				if (!token) return;

				menu.addItem((item) => {
					item
						.setTitle("Save to Instapaper")
						.setIcon("bookmark-plus")
						.onClick(async () => {
							try {
								const bookmark = await this.api.addBookmark(token, { url })
								this.notice(`Saved "${bookmark.title}" to Instapaper`);
							} catch (e) {
								this.notice(`Unable to save to Instapaper`);
								this.log('failed to add bookmark:', e);
							}
						});
				});
			})
		);

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFolder && file.path == this.settings.notesFolder)) {
					return;
				}

				const token = this.settings.token;
				if (!token) return;

				menu.addItem((item) => {
					item
						.setTitle("Sync with Instapaper")
						.setIcon("folder-sync")
						.setSection("Instapaper")
						.onClick((evt) => {
							const resync = Keymap.isModifier(evt, "Mod");
							this.runSync('manual', resync)
								.then(result => this.reportSyncResult(result))
								.catch(e => {
									this.log('Sync failed:', e);
									this.notice('Failed to sync with Instapaper');
								});
						});
				});
			})
		);

		this.addCommand({
			id: 'sync',
			name: 'Sync',
			checkCallback: (checking: boolean) => {
				const token = this.settings.token;
				if (!token) {
					return false;
				}

				if (!checking) {
					this.runSync('manual')
						.then(result => this.reportSyncResult(result))
						.catch(e => {
							this.log('Sync command failed:', e);
							this.notice('Failed to sync with Instapaper');
						});
				}

				return true;
			},
		})

		// Optionally run an immediate sync as soon as the workspace is ready.
		if (this.settings.syncOnStart && this.settings.token) {
			this.app.workspace.onLayoutReady(() => {
				this.runSync('on start').catch(e => {
					this.log('Sync on start failed:', e);
				});
			})
		}
	}

	onunload() {
	}

	log(message: string, ...args: unknown[]): void {
		if (process.env.INSTAPAPER_DEBUG) {
			console.log('[instapaper] ' + message, ...args);
		}
	}

	notice(message: string): Notice {
		this.log(message);
		return new Notice(message);
	}

	// SETTINGS

	async loadSettings() {
		const data = await this.loadData();

		// Migrate pre-0.7.0 settings
		let needsSave = false;
		if (data && Object.hasOwnProperty.call(data, 'notesFrequency')) {
			data['syncFrequency'] = data['notesFrequency'];
			delete data['notesFrequency'];
			needsSave = true;
		}
		if (data && Object.hasOwnProperty.call(data, 'notesSyncOnStart')) {
			data['syncOnStart'] = data['notesSyncOnStart'];
			delete data['notesSyncOnStart'];
			needsSave = true;
		}

		this.settings = mergeOptions(DEFAULT_SETTINGS, data);
		if (needsSave) {
			await this.saveSettings();
		}

		await this.updateSyncInterval();
	}

	async saveSettings(updates?: Partial<InstapaperPluginSettings>) {
		this.settings = {
			...this.settings,
			...updates,
		}
		await this.saveData(this.settings);
	}

	async onExternalSettingsChange() {
		this.log('external settings change');
		await this.loadSettings();
	}

	// ACCOUNT

	async connectAccount(username: string, password: string): Promise<InstapaperAccount> {
		const token = await this.api.getAccessToken(username, password);
		const account = await this.api.verifyCredentials(token);
		await this.saveSettings({
			token: token,
			account: account,
		});

		await this.updateSyncInterval();
		if (this.settings.syncOnStart) {
			await this.runSync('on connect');
		}

		return account;
	}

	async disconnectAccount() {
		await this.saveSettings({
			token: undefined,
			account: undefined,
		});

		this.clearSyncInterval();
	}

	// SYNC

	async runSync(reason: string, resync = false): Promise<SyncResult> {
		const result = { notes: 0 };
		const cursor = resync ? 0 : this.settings.notesCursor;

		const token = this.settings.token;
		if (!token) return result;

		if (this.syncInProgress) {
			this.log('sync is already in progress');
			return result;
		}

		this.syncInProgress = true;
		this.log(`synchronizing (${reason}) @ ${cursor}`);

		try {
			const { cursor: newCursor, count } = await syncNotes(this, token, cursor);
			result.notes = count;
			await this.saveSettings({ notesCursor: newCursor });
		} catch (e) {
			this.log('sync failure:', e);
		} finally {
			this.syncInProgress = false;
		}

		return result;
	}

	clearSyncInterval() {
		window.clearInterval(this.syncInterval);
		this.syncInterval = undefined;
	}

	async updateSyncInterval() {
		this.log('setting sync frequency to',
			this.settings.syncFrequency,
			this.settings.syncFrequency ? 'minutes' : '(manual)'
		);

		this.clearSyncInterval();

		const timeout = this.settings.syncFrequency * 60 * 1000;
		if (!timeout) return; // manual

		this.syncInterval = window.setInterval(() => {
			this.runSync('scheduled')
		}, timeout);
		this.registerInterval(this.syncInterval);
	}

	private reportSyncResult(result: SyncResult) {
		const total = Object.values(result).reduce((a, b) => a + b);
		switch (total) {
			case 0:
				this.notice(`No new Instapaper notes`);
				break;
			case 1:
				this.notice(`Updated 1 Instapaper note`);
				break;
			default:
				this.notice(`Updated ${total} Instapaper notes`);
				break;
		}
	}
}