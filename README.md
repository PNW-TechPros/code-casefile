# The code-casefile Extension

The *code-casefile* extension allows the Visual Studio Code editor to read, modify, export, import, and share casefiles -- hierarchical collections of advanced bookmarks.

## Features

### Casefile Bookmarks

A casefile bookmark is not just a file path and line number.  Each bookmark includes:

* The text selected for the bookmark
* The original line number on which the text was found
* The file path within the project
* Associated, user-editable notes
* For projects with Git source control, the commit and line number in which the bookmarked line was added to the project

Additionally, casefile bookmarks can be organized as child bookmarks of other casefile bookmarks, creating a bookmark hierarchy.  Manipulating the hierarchy of the bookmarks in the current casefile is accomplished by dragging a bookmark to the lower-right side of the bookmark beneath which it should appear; the drop indicator bar should cover part of the lower edge of the bookmark beneath the cursor and *not* extend all the way to the left edge of the intended parent bookmark.  Dragging further to the left will position the dragged bookmarks as next-sibling after the bookmark under the cursor (after all of that bookmarks descendants).  If the drag cursor is moved over the upper part of a bookmark, dropping will place the dragged bookmarks as previous-sibling to the bookmark under the cursor.

### Casefile Sharing

While working on an issue, collecting and referencing a set of bookmark can be a very valuable tool.  Potentially even more valuable is the ability to share the set of bookmarks with other users referencing the same Git repository.  If a sharing peer has been selected, the current casefile (i.e. forest of bookmarks) can be shared from the "Share current casefile to selected peer" button in the *Current Casefile* view title bar.

Casefiles that have been shared can be imported into the current casefile at any time from the *Shared Casefiles* view.

When the current set of bookmarks is no longer relevant, keeping all of those bookmarks around can create unnecessary and frustrating clutter but disposing of them means discarding the accumulated knowledge about the issue they represent.  Casefile sharing also solves this problem, as you can share the current casefile to store it for possible later use -- i.e. sharing it *with your future self*.

As shared casefiles are stored and communicated using Git, creating a set of bookmarks shared between a limited set of users (relative to the visibility of the code) is possible by creating an additional, non-public Git repository configured as an additional remote for the project to which the restricted casefiles can be shared.  This could be important for investigation and validation of security issues.  Also, the history of shared casefiles *is* maintained in Git, so any information deleted can (via external tools) be recovered.

### Casefiles as Text

Many projects use an issue tracking system as part of their project management approach.  It may be beneficial to record a casefile's bookmarks into the ticket if they are relevant to the work done for the ticket.  This extension offers an "Open as text in editor" option from the *Current Casefile* title menu which presents the current casefile as a single text in a new editor.

If the current text editor in Visual Studio Code or VSCodium contains an exported text form of a casefile, a context (i.e. "right-click") menu option to "Import casefile bookmarks" will be available to import the serialized bookmarks into the current casefile.

## Requirements

### Git

To track the location of bookmarks across versions of a file, it is necessary to have access to versioning information.  Currently, this capability is only integrated with the Git vesion control system, though others could be added in the future.  In order to access the version control system information, the `git` executable must be installed and available in either the path specified in the configuration setting for this extension or in the `PATH` environment variable used by the running editor.

### Diff

When a comparison between the live content of a file and the content at a specific commit are needed, the `diff` command is used to compute the differences.  Similar to `git` described above, this command is searched for in the locations specified in the external tools configuration setting for this extension (if given) or in the `PATH` environment variable used by the running editor.

## Extension Settings

### Casefile > External Tools: Path

A value that overrides the `PATH` environment variable of the editor to specify folders/subdirectories to search for the needed external tools (currently `git` and `diff`).

### Casefile: Use Default Keyboard Shortcuts

If this option is disabled, the default keyboard shortcuts defined by this extension are disabled.  The standard Visual Studio Code mechanism for assigning commands to key combinations can be used to assign custom sequences to *code-casefile* bookmark creation or other commands.

## Default Keyboard Shortcuts

The *code-casefile* extension comes with a predefined, default keyboard shortcut for creating new bookmarks:

| Operation       | Windows/Linux | Mac         |
| :-------------- | :-----------: | :---------: |
| Create bookmark | Ctrl-Shift-8  | ⇧ ⌘ 8       |

## Working Example

The [`code-casefile` repository][repo] itself has shared casefiles documenting key aspects of its implementation.

1. Clone the repository:
```shell
    git clone https://github.com/PNW-TechPros/code-casefile.git
```
2. Open the repository in Visual Studio Code or VSCodium.
3. In the Explorer side bar, locate the *Shared Casefiles* view.  Expand it if it is collapsed.
4. Click the "Fetch the shared casefiles" item.
5. Once the list of casefiles loads, click the "Import this casefile into current" button on the "Key parts of extension" item.
6. If the *Current Casefile* view in the Explorer side bar is collapsed, expand it to see the bookmarks that have now been imported.

It is important to note that the casefile list and the casefiles themseleves are live on the project repository: imported bookmarks may reference code that is no longer in the project.  Local changes would have to be shared with the GitHub repository to make changes persistent and visible to others; doing so requires commit permission on the repository.  You could experiment by making a GitHub clone of the repository, configuring it as an additional Git remote (`git remote add ...`), and using the "Select peer for sharing" option in the *Shared Casefiles* title menu.

### A Few Things to Try

* Click on a bookmark to open the relevant code.
* Drag bookmarks to change their organizational structure (order, depth in the tree).  A phantom indicator bar appears to show the new location.  Note that left-to-right position along the bottom of a bookmark can change where the dragged bookmark(s) are dropped.
* Drop bookmarks in the "Remove" area that appears at the bottom of the tree when dragging.
* Delete all the bookmarks from the *Current Casefile* title menu.
* Delete a bookmark (and all it's descendants) through its context (i.e. "right-click") menu.
* Add another folder that is a Git repository to the workspace and/or another Git remote to a folder already in the workspace and use the "Select peer for sharing" command (title bar menu of the "Shared Casefiles" view or the command palette) to see the additional peer's list of shared casefiles.

## Release Notes

Please see the [CHANGELOG](./CHANGELOG.md) document.

## Reporting Issues

Please use the project's [issue tracker on GitHub](https://github.com/PNW-TechPros/code-casefile/issues).

---

## Following extension guidelines

Please ensure that you've read through the extensions guidelines and follow the best practices when proposing modifications to this extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

[repo]: https://github.com/PNW-TechPros/code-casefile
