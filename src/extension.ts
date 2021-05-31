import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { OpenFileManager } from './openFileManager';

export function activate(context: vscode.ExtensionContext) {
	const manager = new OpenFileManager();
	context.subscriptions.push(vscode.commands.registerCommand('openfile.open', async () => {
		await manager.open();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openfile.terminal', () => {
		manager.createTerminal();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('openfile.openDir', () => {
	}));

}

export function deactivate() { }
