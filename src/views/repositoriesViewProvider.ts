import * as vscode from "vscode";
import { GitService } from "../git/gitService";

export interface RepositoryViewEntry {
  name: string;
  root: string;
}

class RepositoryTreeItem extends vscode.TreeItem {
  constructor(
    readonly repository: RepositoryViewEntry,
    branch: string | null,
    selected: boolean,
  ) {
    super(repository.name, vscode.TreeItemCollapsibleState.None);

    // Mark the row as a real folder resource so VS Code and other views can
    // receive it through the standard text/uri-list drag protocol.
    this.resourceUri = vscode.Uri.file(repository.root);
    this.description = branch ?? undefined;
    this.tooltip = new vscode.MarkdownString(
      `**${repository.name}**\n\n${repository.root}${branch ? `\n\nBranch: \`${branch}\`` : ""}`,
    );
    this.iconPath = new vscode.ThemeIcon(selected ? "check" : "repo");
    this.contextValue = selected ? "selectedRepository" : "repository";
    this.command = {
      command: "git-brains.selectRepository",
      title: "Select Repository",
      arguments: [repository.root],
    };
    this.accessibilityInformation = {
      label: `${repository.name}${branch ? `, branch ${branch}` : ""}${selected ? ", selected" : ""}`,
    };
  }
}

/** Native repository list shown above the Commit webview. */
export class RepositoriesViewProvider
  implements
    vscode.TreeDataProvider<RepositoryTreeItem>,
    vscode.TreeDragAndDropController<RepositoryTreeItem>,
    vscode.Disposable
{
  readonly dragMimeTypes = ["text/uri-list"];
  readonly dropMimeTypes: readonly string[] = [];

  private readonly changeEmitter = new vscode.EventEmitter<
    RepositoryTreeItem | undefined
  >();

  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(
    private readonly repositories: RepositoryViewEntry[],
    private readonly getCurrentRoot: () => string | null,
  ) {}

  getTreeItem(element: RepositoryTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: RepositoryTreeItem,
  ): Promise<RepositoryTreeItem[]> {
    if (element) return [];

    const currentRoot = this.getCurrentRoot();
    return Promise.all(
      this.repositories.map(async (repository) => {
        const branch = await new GitService(repository.root)
          .getCurrentBranch()
          .catch(() => null);
        return new RepositoryTreeItem(
          repository,
          branch,
          repository.root === currentRoot,
        );
      }),
    );
  }

  refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  handleDrag(
    source: readonly RepositoryTreeItem[],
    dataTransfer: vscode.DataTransfer,
  ): void {
    const uriList = source
      .map((item) => vscode.Uri.file(item.repository.root).toString())
      .join("\r\n");
    if (uriList) {
      dataTransfer.set("text/uri-list", new vscode.DataTransferItem(uriList));
    }
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}
