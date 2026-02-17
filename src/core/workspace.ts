export type UriLike = {
	readonly fsPath: string;
};

export type DocumentLike = {
	readonly uri: unknown;
};

export type ActiveEditorLike = {
	readonly document: DocumentLike;
};

export type WorkspaceFolderLike = {
	readonly uri: UriLike;
};

type WorkspaceResolverParams = {
	readonly activeEditor: ActiveEditorLike | undefined;
	readonly getWorkspaceFolder: (uri: unknown) => WorkspaceFolderLike | undefined;
	readonly workspaceFolders: readonly WorkspaceFolderLike[] | undefined;
};

export function resolveWorkspaceRoot(params: WorkspaceResolverParams): string | undefined {
	const { activeEditor, getWorkspaceFolder, workspaceFolders } = params;

	if (activeEditor) {
		const folder = getWorkspaceFolder(activeEditor.document.uri);
		if (folder) {
			return folder.uri.fsPath;
		}
	}

	return workspaceFolders?.[0]?.uri.fsPath;
}
