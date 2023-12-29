import { Notice, Plugin } from 'obsidian';
import { InstapaperAccount, InstapaperAPI } from './api'
import { DEFAULT_SETTINGS, InstapaperPluginSettings, InstapaperSettingTab } from './settings'
import { syncNotes } from './notes';

export default class InstapaperPlugin extends Plugin {
	settings: InstapaperPluginSettings;
	api: InstapaperAPI;
	notesSyncInterval?: number;
	notesSyncInProgress = false;

	async onload() {
		this.api = new InstapaperAPI(
			'a50094964b804f5780b6b9d6d55661ec',
			'3805a15607374a0dabc716f7e7f007d1',
		);

		await this.loadSettings();
		this.addSettingTab(new InstapaperSettingTab(this.app, this));

		this.addCommand({
			id: 'instapaper-sync-notes',
			name: 'Sync notes',
			checkCallback: (checking: boolean) => {
				const token = this.settings.token;
				if (!token) {
					return false;
				}

				if (!checking) {
					(async () => {
						const count = await this.runNotesSync('manual');
						this.notice(`Updated ${count} Instapaper note${count == 1 ? '' : 's'}`);
					})();
				}

				return true;
			},
		})

		// Start the notes sync interval and optionally run an immediate sync.
		this.updateNotesSyncInterval();
		if (this.settings.notesSyncOnStart && this.settings.token) {
			this.runNotesSync('on start');
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(updates?: Partial<InstapaperPluginSettings>) {
		this.settings = {
			...this.settings,
			...updates,
		}
		await this.saveData(this.settings);
	}

	// ACCOUNT

	async connectAccount(username: string, password: string): Promise<InstapaperAccount> {
		const token = await this.api.getAccessToken(username, password);
		const account = await this.api.verifyCredentials(token);
		await this.saveSettings({
			token: token,
			account: account,
		});
		return account;
	}

	async disconnectAccount() {
		await this.saveSettings({
			token: undefined,
			account: undefined,
		});
	}

	// SYNC

	async runNotesSync(reason: string): Promise<number> {
		const token = this.settings.token;
		if (!token) return 0;

		if (this.notesSyncInProgress) {
			this.log('Notes sync is already in progress');
			return 0;
		}

		this.log(`Synchronizing notes (${reason})`);
		this.notesSyncInProgress = true;
		const { cursor, count } = await syncNotes(this, token, this.settings.notesCursor);
		await this.saveSettings({ notesCursor: cursor });
		this.notesSyncInProgress = false;

		return count;
	}

	async updateNotesSyncInterval() {
		this.log('Setting notes sync frequency to',
			this.settings.notesFrequency,
			this.settings.notesFrequency ? 'minutes' : '(manual)'
		);

		window.clearInterval(this.notesSyncInterval);
		this.notesSyncInterval = undefined;

		const timeout = this.settings.notesFrequency * 60 * 1000;
		if (!timeout) return; // manual

		this.notesSyncInterval = window.setInterval(() => {
			this.runNotesSync('scheduled')
		}, timeout);
		this.registerInterval(this.notesSyncInterval);
	}
}