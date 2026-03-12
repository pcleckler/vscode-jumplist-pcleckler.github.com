import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import {Pin} from './classes/models/generated/Pin.js';

export default class VsCodeJumpLists extends Extension {

    MenuItemTypeAttribute = "MenuItemType";

    MenuIcons = {
        workspace: "view-grid-symbolic",
        folder: "folder-symbolic",
    };

    vsCodeHistory = {entries: []};

    /** @type {Pin[]} */
    pinned = [];

    pinsDir = null;

    HomeDir = "";

    /**
     * @param {string} promptText
     * @param {{ (newLabel: any): void; (arg0: any): void; }} callback
     */
    promptForLabel(promptText, callback) {

        let dialog = new ModalDialog.ModalDialog({
            styleClass: null,
            destroyOnClose: true
        });

        // Title label
        const title = new St.Label({ text: this.metadata.name });
        title.style_class = "jumplist-title";
        dialog.contentLayout.add_child(title);

        // Message label
        const label = new St.Label({ text: "Enter label for pinned item:" });
        dialog.contentLayout.add_child(label);

        let entry = new St.Entry({
            style_class: 'jumplist-entry',
            can_focus: true,
            hint_text: 'Enter label...',
            x_expand: true,
            text: promptText,
        });

        entry.set_width(400);

        dialog.contentLayout.add_child(entry);

        dialog.setButtons([
            {
                label: "Cancel",
                action: () => dialog.close(),
                key: Clutter.KEY_Escape
            },
            {
                label: "OK",
                default: true,
                action: () => {
                    let text = entry.get_text();
                    dialog.close();
                    callback(text);
                },
            }
        ]);

        dialog.open();

        // Important: grab focus after open()
        entry.grab_key_focus();

    }

    /**
     * @param {string} message
     */
    messageBox(message) {

        let dialog = new ModalDialog.ModalDialog({
            styleClass: null,
            destroyOnClose: true
        });

        // Title label
        const title = new St.Label({ text: this.metadata.name });
        title.style_class = "jumplist-title";
        dialog.contentLayout.add_child(title);

        // Message label
        const label = new St.Label({ text: message });
        dialog.contentLayout.add_child(label);

        dialog.setButtons([
            {
                label: "OK",
                action: () => dialog.close(),
                key: Clutter.KEY_Escape
            }
        ]);

        dialog.open();
    }

    loadHistory() {

        try {

            // Load VSCode history from SQLite database
            let [ok, stdout, stderr, status] = GLib.spawn_command_line_sync(
                `sqlite3 ${this.dbPath} "SELECT value FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList';"`
            );

            if (ok) {

                let result = new TextDecoder().decode(stdout).trim();

                try {
                    if (result.length > 0) {
                        this.vsCodeHistory = JSON.parse(result);
                    }
                } catch (error) {
                    this.logMessage("Failed to parse VSCode history JSON:", error);

                    this.logMessage("VSCode history JSON:", result);
                }

            } else {
                this.messageBox(`Error running sqlite3: ${new TextDecoder().decode(stderr)}. Make sure 'sqlite3' is installed and in your PATH.`);
            }

            if (this.pinsDir === null) {
                this.logMessage("Pins directory not initialized.");
                return;
            }

            // Ensure Pinned directory exists
            if (!this.pinsDir.query_exists(null)) {
                try {
                    this.pinsDir.make_directory_with_parents(null);
                } catch (e) {
                    this.messageBox(`Error creating pins directory:\n\n${e}`);
                    // Abort if we can't create it
                    return;
                }
            }

            // Get Pinned records
            let enumerator = this.pinsDir.enumerate_children(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let info;

            this.pinned = []; // clear old pins

            while ((info = enumerator.next_file(null)) !== null) {

                if (info.get_file_type() === Gio.FileType.REGULAR) {

                    const child = this.pinsDir.get_child(info.get_name());

                    let [ok2, contents] = GLib.file_get_contents(child.get_path());

                    if (ok2) {

                        const json = new TextDecoder().decode(contents);

                        const pinObj = JSON.parse(json);

                        if (Pin.CanConvert(pinObj)) {
                            this.pinned.push(Pin.ConvertFromObj(pinObj));
                        }

                    } else {
                        this.logMessage("Failed to load pinned file:", info.get_name(), ok2);
                    }
                }
            }

            enumerator.close(null);

            // Populate the menu
            this.populateMenu(this._indicator.menu);

        } catch(e) {
            this.messageBox(`Error loading VSCode history:\n\n${e}`);
        }
    }

    /** @param {...any} messages */
    logMessage(...messages) {
        console.log("[JumpList]", ...messages);
    }


    /** @param {string} path */
    launchVSCode(path) {

        try {

            // Run code for a directory or file
            GLib.spawn_command_line_async(`code "${path}"`);

        } catch (error) {
            this.messageBox(`Error launching VSCode:\n\n${error}`);
        }
    }

    /**
     * @param {string} path
     * @param {boolean} isWorkspace
     * @param {string} label
     */
    pin(path, isWorkspace, label) {

        try {

            // this.logMessage("Pinning entry:", path, label);

            let pinFilename = GLib.build_filenamev([this.pinsDirPath, `Pin-${GLib.uuid_string_random()}.json`]);
            let file = Gio.File.new_for_path(pinFilename);

            let pin = Pin.ConvertFromObj({
                Path: path,
                Label: label,
                IsWorkspace: isWorkspace,
                PinFilename: pinFilename,
            });

            let stream = file.replace(
                null,
                false,
                Gio.FileCreateFlags.NONE,
                null
            );

            stream.write_all(JSON.stringify(pin.ConvertToObj()), null);
            stream.close(null);

            this.loadHistory();

        } catch (e) {
            this.messageBox(`Error pinning:\n\n${e}`);
        }
    }

    /** @param {Pin} pin */
    unpin(pin) {
        try {

            const file = Gio.File.new_for_path(pin.PinFilename);

            file.delete(null);

            this.loadHistory();

        } catch (e) {
            this.messageBox(`Error unpinning:\n\n${e}`);
        }
    }

    /**
     * @param {PopupMenu} menu
     * @param {boolean} isWorkspace
     * @param {string} path
     * @param {Pin?} pin
     */
    addMenuItem(menu, isWorkspace, path, pin) {

        const shortPath = path.replace(this.HomeDir, "~");

        const itemLabel = pin != null ? `${pin.Label}` : `${shortPath}`;

        const item = new PopupMenu.PopupMenuItem(itemLabel);

        item.set_data(this.MenuItemTypeAttribute, isWorkspace ? this.MenuIcons.workspace : this.MenuIcons.folder);

        item.connect('activate', () => {
            this.launchVSCode(path);
        });

        // Create star icon
        const starIcon = new St.Icon({
            icon_name: pin != null ? 'started-symbolic' : 'non-starred-symbolic',
            // style_class: pin != null ? 'pin-icon' : 'system-status-icon',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            icon_size: 12,
        });

        // Wrap icon in button
        const starButton = new St.Button({
            // child: starIcon,
            reactive: true,
            can_focus: true,
            track_hover: true,
            label: pin != null ? '🖈' : '🖈',
            style_class: pin != null ? 'system-status-icon' : 'system-status-icon-dimmed',
        });

        starButton.connect('clicked', () => {

            try {

                if (pin != null) {

                    this.unpin(pin);

                } else {

                    this.promptForLabel(shortPath, (newLabel) => {

                        if (newLabel.length > 0) {
                            this.pin(path, isWorkspace, newLabel);
                        }
                    });
                }
            } catch (error) {
                this.messageBox(`Error handling star button clicked:\n\n${error}`);
            }
        });

        // Add icon to the left side
        let itemIcon = new St.Icon({ icon_name: isWorkspace ? this.MenuIcons.workspace : this.MenuIcons.folder, style_class: "popup-menu-icon" });
        item.actor.insert_child_at_index(itemIcon, 0); // index 0 => leftmost

        // Push icon to right side
        item.add_child(starButton);
        item.label.set_x_expand(true);

        menu.addMenuItem(item);
    }


    /** @param {PopupMenu} menu */
    populateMenu(menu) {

        menu.removeAll(); // clear old entries

        /** @type {Object<string, Pin>} */
        let pinnedIndex = {};

        this.pinned.forEach(pin => {

            pinnedIndex[pin.Path] = pin;

            this.addMenuItem(menu, pin.IsWorkspace, pin.Path, pin);
        });

        let separatorAdded = false;

        this.vsCodeHistory.entries.forEach(entry => {

            let path = "";

            let isWorkspace = false;

            if ("workspace" in entry && "configPath" in entry.workspace) {

                path = entry.workspace.configPath.replace("file://", "");

                isWorkspace = true;

            } else if ("folderUri" in entry) {

                path = entry.folderUri.replace("file://", "");
            }

            if (path.length < 1) return;

            path = decodeURIComponent(path);

            if (path in pinnedIndex) return; // skip pinned items

            if (!separatorAdded && this.pinned.length > 0) {
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                separatorAdded = true;
            }

            try {
                this.addMenuItem(menu, isWorkspace, path, null);
            } catch (error) {
                this.logMessage("Error processing history entry:", error);
            }
        });
    }

    enable() {

        try {

            this.HomeDir = GLib.get_home_dir();

            this.pinsDirPath = GLib.build_filenamev([this.HomeDir, '.config/vscode-jump-pins']);
            this.pinsDir = Gio.File.new_for_path(this.pinsDirPath);

            // Locate VSCode history database
            this.dbPath = GLib.build_filenamev([this.HomeDir, '.config/Code/User/globalStorage/state.vscdb']);
            this.dbPathFile = Gio.File.new_for_path(this.dbPath);

            if (!this.dbPathFile.query_exists(null)) {
                this.messageBox(`VSCode history database not found at expected location:\n\n${this.dbPath}`);
                return false;
            }

            // Verify sqlite3 installation
            let [ok, stdout, stderr, status] = GLib.spawn_command_line_sync(`which sqlite3`);

            if (!ok) {

                this.messageBox(`Error checking for sqlite3:\n\n${new TextDecoder().decode(stderr)}. Make sure 'sqlite3' is installed and in your PATH.`);
                return false;

            } else {

                let result = new TextDecoder().decode(stdout).trim();

                if (result.length < 1) {
                    this.messageBox(`sqlite3 not found. Make sure 'sqlite3' is installed and in your PATH.`);
                    return false;
                }
            }

            // Create a panel button
            this._indicator = new PanelMenu.Button(0.5, this.metadata.name, false);

            // Add an icon
            const icon = new St.Icon({
                icon_name: 'vscode',
                style_class: 'system-status-icon',
            });

            this._indicator.add_child(icon);

            this._indicator.menu.connect('open-state-changed', (menu, isOpen) => {
                if (isOpen) {
                    this.loadHistory();
                }
            });

            // Add the indicator to the panel
            Main.panel.addToStatusArea(this.uuid, this._indicator);

            this.loadHistory();

        } catch (error) {
            this.messageBox(`Error enabling the VSCode-JumpList extension:\n\n${error}.`);
            return false;
        }
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        return true;
    }
}
