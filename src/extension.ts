import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { OpenFileManager } from './openFileManager';

export function activate(context: vscode.ExtensionContext) {
	const manager = new OpenFileManager();
	context.subscriptions.push(vscode.commands.registerCommand('quickcd.open', async () => {
		await manager.open();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('quickcd.default_terminal', () => {
		manager.createTerminal("defaultPath");
	}));
	context.subscriptions.push(vscode.commands.registerCommand('quickcd.terminal', () => {
		manager.createTerminal();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('quickcd.fileExplorer', async () => {
		await manager.revealInFileExplorer();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('quickcd.cd', async () => {
		await manager.cdDirectory();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('quickcd.openInVS', async () => {
		await manager.openInVS();
	}));

	vscode.workspace.onDidChangeConfiguration(() => {
		manager.loadConfig();
	});

	vscode.window.onDidChangeActiveTerminal(e => {
		manager.changeTerminal(e);
	});

	vscode.window.onDidCloseTerminal(e => {
		manager.onCloseTerminal(e);
	});
}

export function deactivate() { }
