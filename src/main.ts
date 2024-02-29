import { Notice, Plugin } from 'obsidian';
import { InstapaperAccount, InstapaperAPI } from './api'
import { DEFAULT_SETTINGS, InstapaperPluginSettings, InstapaperSettingTab } from './settings'
import { syncNotes } from './notes';

export default class InstapaperPlugin extends Plugin {
	settings: InstapaperPluginSettings;
	api: InstapaperAPI;
	syncInterval?: number;
	syncInProgress = false;

	async onload() {
		this.api = new InstapaperAPI(
			// @ts-expect-error
			process.env.INSTAPAPER_CONSUMER_KEY,
			process.env.INSTAPAPER_CONSUMER_SECRET,
		);

		await this.loadSettings();
		this.addSettingTab(new InstapaperSettingTab(this.app, this));

		this.addCommand({
			id: 'sync',
			name: 'Sync',
			checkCallback: (checking: boolean) => {
				const token = this.settings.token;
				if (!token) {
					return false;
				}

				if (!checking) {
					(async () => {
						const counts = await this.runSync('manual');
						const total = Object.values(counts).reduce((a, b) => a + b);
						this.notice(`Updated ${total} Instapaper item${total == 1 ? '' : 's'}`);
					})();
				}

				return true;
			},
		})

		// Optionally run an immediate sync as soon as the workspace is ready.
		if (this.settings.syncOnStart && this.settings.token) {
			this.app.workspace.onLayoutReady(async () => {
				await this.runSync('on start');
			})
		}
	}

	onunload() {
	}

	log(message: string, ...args: unknown[]): void {
		console.log('[instapaper] ' + message, ...args);
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
		if (Object.hasOwnProperty.call(data, 'notesFrequency')) {
			data['syncFrequency'] = data['notesFrequency'];
			delete data['notesFrequency'];
			needsSave = true;
		}
		if (Object.hasOwnProperty.call(data, 'notesSyncOnStart')) {
			data['syncOnStart'] = data['notesSyncOnStart'];
			delete data['notesSyncOnStart'];
			needsSave = true;
		}

		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
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

	async runSync(reason: string): Promise<{ notes: number }> {
		const counts = { notes: 0 };

		const token = this.settings.token;
		if (!token) return counts;

		if (this.syncInProgress) {
			this.log('sync is already in progress');
			return counts;
		}

		this.syncInProgress = true;
		this.log(`synchronizing (${reason})`);

		try {
			const { cursor, count } = await syncNotes(this, token, this.settings.notesCursor);
			counts.notes = count;
			await this.saveSettings({ notesCursor: cursor });
		} catch (e) {
			this.log('sync failure:', e);
		} finally {
			this.syncInProgress = false;
		}

		return counts;
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
}