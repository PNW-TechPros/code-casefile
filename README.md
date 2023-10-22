# code-casefile README

The *code-casefile* extension allows the Visual Studio Code editor to read, modify, export, import, and share casefiles -- hierarchical collections of advanced bookmarks.

## Features

### Casefile Bookmarks

A casefile bookmark is not just a file path and line number.  Each bookmark includes:

* The text selected for the bookmark
* The original line number on which the text was found
* The file path within the project
* Associated, user-editable notes
* For projects with Git source control, the commit and line number in which the bookmarked line was added to the project

Additionally, casefile bookmarks can be organized as child bookmarks of other casefile bookmarks, creating a bookmark hierarchy.

## Requirements

### Git

To track the location of bookmarks across versions of a file, it is necessary to have access to versioning information.  Currently, this capability is only integrated with the Git vesion control system, though others could be added in the future.  In order to access the version control system information, the `git` executable must be installed and available in either the path specified in the configuration setting for this extension or in the `PATH` environment variable used by the running editor.

### Diff

When a comparison between the live content of a file and the content at a specific commit are needed, the `diff` command is used to compute the differences.

## Extension Settings

### Casefile > External Tools: Path

A value that overrides the `PATH` environment variable of the editor to specify folders/subdirectories to search for the needed external tools (currently `git` and `diff`).

## The Available, Preliminary Experience

The two views provided by code-casefile show by default in the "Explorer" view, normally found in the primary side-bar.  These two views are the "Current Casefile" and "Shared Casefiles" views.

* Clone this repository (you could watch it, too, so you'll be notified of future improvements) to your local machine.
* Open the project in VS Code.
* Run the "Debug: Start Without Debugging" command.
* In the new, "Extension Development Host" window:
    * Select the "File" menu, then "Add Folder to Workspace..." command.
    * In the "Add Folder to Workspace" dialog, select the *code-casefile* folder you cloned for addition.
    * Open the "Shared Casefiles" view.
    * Click on "Fetch the shared casefiles list".
    * After a brief delay, at least one casefile named "Key parts of extension" should appear.
    * Click the "pull" icon (tooltip: "Import this casefile into current") to the right of the name "Key parts of extension".
    * Look at the "Current Casefile" view: it should contain a forest of bookmarks.

To import the bookmarks again, you may first want to delete all the bookmarks from the current casefile by clicking the ellipsis (i.e. menu) button to the right of the "Current Casefile" title or run the "Casefile: Delete all bookmarks from current casefile" command from the command palette.

At any time, it is possible to re-fetch the shared casefiles list by selecting the "refresh" icon (tooltip: "Fetch casefiles from the selected peer") in the title bar of the "Shared Casefiles" section of the "Explorer" view.

It is important to note that the casefile list and the casefiles themseleves are live on the project repository; imported bookmarks may reference code that is no longer in the project.  Local changes would have to be shared with the repo to make changes visible, but this functionality is not yet implemented (meaning there is no way to wreck the demonstration through use of this extension).

### A Few Things to Try

* Click on a bookmark to open the relevant code.
* Drag bookmarks to change their organizational structure (order, depth in the tree).  A phantom indicator bar appears to show the new location.  There is a known bug about dropping on the phantom bar itself.
* Drop bookmarks in the "Remove" area that appears at the bottom of the tree when dragging.
* Delete all the bookmarks from the "Current Casefile" title menu.
* Delete a bookmark (and all it's descendants) through its context menu.
* Add another folder that is a Git repository to the workspace and/or another Git remote to a folder already in the workspace and use the "Select peer for sharing" command (title bar menu of the "Shared Casefiles" view or the command palette) to see the additional peer's list of shared casefiles.

## Release Notes

Please see the [CHANGELOG](./CHANGELOG.md) document.

---

## Following extension guidelines

Please ensure that you've read through the extensions guidelines and follow the best practices when proposing modifications to this extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
