menuitem-label = Addon Template: Helper Examples
menupopup-label = Better Vertical Tabs
menuitem-submenulabel = Addon Template

menuitem-submenulabel-1 = Author
menuitem-submenulabel-1-1 = Merge and Separate
menuitem-submenulabel-1-1-1 = Merge names - zh
menuitem-submenulabel-1-1-2 = Separate names - zh
menuitem-submenulabel-1-1-3 = Merge names - en
menuitem-submenulabel-1-1-4 = Separate names - en
menuitem-submenulabel-1-2 = Switch last and first names
menuitem-submenulabel-1-3 = Authors in one line
menuitem-submenulabel-1-4 = Remove hyphen - in first name
menuitem-submenulabel-1-5 = Input Names 



menuitem-submenulabel-2 = Date-ISO
menuitem-submenulabel-3 = Language
menuitem-submenulabel-4 = Extra-clear
menuitem-submenulabel-5 = Help instructions

menuitem-filemenulabel = Addon Template: File Menuitem
prefs-title = Better Vertical Tabs
prefs-table-title = Title
prefs-table-detail = Detail
tabpanel-lib-tab-label = Lib Tab
tabpanel-reader-tab-label = Reader Tab

# Dialog: Manual Input Authors
dialog-input-title = Enter Author Names
dialog-input-column = Select Column Mode
dialog-input-column-single = Single Column: Merge Names
dialog-input-column-double = Double Column: Separate Names
dialog-input-name-order = Select Name Order
dialog-input-name-order-note = Note: Chinese names can ignore this option, English names require order selection
dialog-input-surname-first = Surname + Given (Surname First)
dialog-input-given-first = Given + Surname (Given First)
dialog-input-enter-authors = Enter All Authors
dialog-input-enter-authors-hint = Chinese names do not need separators, use spaces between English surname and given name<br/>Different lines for different authors
dialog-input-placeholder = Enter authors...

# Dialog: All Authors in One Line
dialog-oneline-title = Edit All Authors in One Line
dialog-oneline-separator = Select Author Separator
dialog-oneline-separator-comma = Half-width Comma ,
dialog-oneline-separator-semicolon = Half-width Semicolon ;
dialog-oneline-separator-comma-fw = Full-width Comma ，
dialog-oneline-separator-semicolon-fw = Full-width Semicolon ；
dialog-oneline-separator-other = Other:
dialog-oneline-column = Select Column Mode
dialog-oneline-column-single = Single Column: Merge Names
dialog-oneline-column-double = Double Column: Separate Names

# Common Dialog Buttons
dialog-confirm = Confirm
dialog-cancel = Cancel

# Dialog: Help
dialog-help-title = Better Vertical Tabs Help
dialog-help-heading = Help
dialog-help-content = This plugin is designed to batch and manually edit item metadata. Please note that in Zotero's two-field format, it is surname + given name; in single-field mode, it is given name + space + surname.<br/><br/>Features:<br/><br/>-1. Author name correction<br/><br/>&nbsp;&nbsp;&nbsp;&nbsp;-1.1 Merge and split author names<br/>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Use different methods for Chinese and English literature<br/>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Two-field: surname first; Single-field: Chinese keeps surname-first, English keeps given-first<br/><br/>&nbsp;&nbsp;&nbsp;&nbsp;-1.2 Switch author name order (recommended in two-field mode; single-field uses first space to split)<br/><br/>&nbsp;&nbsp;&nbsp;&nbsp;-1.3 Edit when all authors are in one line<br/><br/>&nbsp;&nbsp;&nbsp;&nbsp;-1.4 Remove hyphens in given names<br/><br/>&nbsp;&nbsp;&nbsp;&nbsp;-1.5 Manually enter all authors with column mode selection<br/><br/>-2. Batch date format to ISO YYYY-MM-DD<br/><br/>-3. Batch edit language, customizable<br/><br/>-4. Batch clear Extra field for annotations
dialog-close = Close

# Date-ISO ProgressWindow
date-iso-title = Date Formatting Complete
date-iso-result =
    Updated { $updated } items, { $noDate } without date, { $skipped } skipped

# Vertical Tabs
vertical-tabs-title = Opened PDFs
vertical-tabs-empty = No opened PDFs
vertical-tabs-category-default = Uncategorized
vertical-tabs-category-new = New Category
vertical-tabs-new-category-dropzone = + New Category

vertical-tabs-just-now = just now
vertical-tabs-minutes-ago = { $count } minutes ago
vertical-tabs-hours-ago = { $count } hours ago
vertical-tabs-days-ago = { $count } days ago
vertical-tabs-category-tabs-count = { $count } tabs
vertical-tabs-expand-mode-auto = Auto-expand mode
vertical-tabs-expand-mode-manual = Manual expand mode
vertical-tabs-expand-mode-minimal = Compact mode

vertical-tabs-collapse = Collapse Sidebar
vertical-tabs-expand = Expand Sidebar
vertical-tabs-pin = Pin Sidebar
vertical-tabs-unpin = Unpin Sidebar
vertical-tabs-rename = Rename
vertical-tabs-delete = Delete
vertical-tabs-add-category = Add Category
vertical-tabs-remove-from-category = Remove from Category

vertical-tabs-authors = Authors
vertical-tabs-year = Year
vertical-tabs-journal = Journal
vertical-tabs-tags = Tags
vertical-tabs-thumbnail-error = Thumbnail unavailable

# Vertical Tabs — Search / Buttons / Menus
vertical-tabs-search-placeholder = Search
vertical-tabs-confirm = Confirm
vertical-tabs-cancel = Cancel
vertical-tabs-show-in-library = Show in Library
vertical-tabs-duplicate-tab = Duplicate Tab
vertical-tabs-open-reader = Open Reader
vertical-tabs-close-reader = Close Reader
vertical-tabs-close-tab = Close
vertical-tabs-close-selected-tabs = Close Selected Tabs
vertical-tabs-close-other-tabs = Close Other Tabs
vertical-tabs-extra = Extra
vertical-tabs-edit-extra = Edit Extra
vertical-tabs-university = University

# Save / Import Categories
vertical-tabs-save-category = Save Category
vertical-tabs-overwrite-title = Category Already Exists
vertical-tabs-overwrite-confirm = A saved category named "{ $name }" already exists. Do you want to overwrite it?
vertical-tabs-save-success = Save successful.
vertical-tabs-more-menu = More
vertical-tabs-import-category = Import Category
vertical-tabs-hide-native-tab-bar = Hide Native Tabs
vertical-tabs-show-native-tab-bar = Show Native Tabs
vertical-tabs-plugin-settings = Plugin Settings
vertical-tabs-import-dialog-title = Import or Edit Categories
vertical-tabs-no-saved-categories = No saved categories yet. Right-click a category and select "Save Category" to create one.
vertical-tabs-apply-category = Apply
vertical-tabs-rename-saved-category = Rename
vertical-tabs-delete-saved-category = Delete
vertical-tabs-restore-warning-title = Category Restored with Warnings
vertical-tabs-restore-missing = { $count } items in the saved category no longer exist in the library and were skipped.
vertical-tabs-restore-updated = { $count } items' metadata have been updated since the category was saved.
vertical-tabs-restore-confirm-hint = The remaining valid items have been successfully restored.
vertical-tabs-drop-missing-pdf = Some dragged items have no PDF attachments. Please check.

# Help
vertical-tabs-help = Help
vertical-tabs-help-dialog-title = Better Vertical Tabs Help
vertical-tabs-help-section-1-title = 1. Tab Creation & Drag-and-Drop
vertical-tabs-help-section-1-content = Double-click an item or drag multiple selected items to the sidebar to create tabs. The plugin will automatically open the first attachment of the item.<br/><br/>Drag-and-drop supports individual tab dragging, as well as Ctrl/Shift+click to multi-select and drag tabs to reorder or categorize them.
vertical-tabs-help-section-2-title = 2. Category Creation
vertical-tabs-help-section-2-content = Three ways to create categories:<br/>
 - ① Right-click one or more tabs and select "Add Category".<br/><img src="chrome://better-vertical-tabs/content/figs/add1-en.jpg" style="max-width:50%; border-radius:6px;margin:auto;display:block;"/><br/>
 - ② Drag one or more tabs to the "+ New Category" drop zone at the top of the sidebar.<img src="chrome://better-vertical-tabs/content/figs/add2-en3.gif" style="max-width:45%; border-radius:6px;margin:auto;display:block;"/><br/>
 - ③ Click "More > Add Category" in the top-right corner to create a category, then drag tabs into it.<img src="chrome://better-vertical-tabs/content/figs/add3-en.jpg" style="max-width:40%; border-radius:6px;margin:auto;display:block;"/><br/>
vertical-tabs-help-section-3-title = 3. Save and Import Categories
vertical-tabs-help-section-3-content = If you frequently use a set of tabs, you can save the tabs in a category for later use.<br/><br/>Right-click a category title and select "Save Category" to persist the current category; use "More > Import Category" to restore saved categories.<br/><br/>On the "Import Category" page, you can rename or delete previously saved categories.
vertical-tabs-help-section-4-title = 4. PDF Reader Automatic Memory Optimization
vertical-tabs-help-section-4-content = Zotero opens PDFs in sandboxed readers. The more readers are open, the more memory is consumed, which can slow down Zotero.<br/><br/>Tabs with an active PDF reader are marked with a green indicator bar on the left edge (this indicator can be disabled in Plugin Settings).<br/><br/>From the tab right-click menu, you can manually close or open the reader to free memory (this does not close the tab). The plugin also supports automatically closing readers that have been inactive for a set period; the default is 120 minutes, adjustable in Plugin Settings.<br/><br/>The plugin can also auto-close long-unused tabs, but this feature must be manually enabled in Plugin Settings.
vertical-tabs-help-section-5-title = 5. Other Settings
vertical-tabs-help-section-5-content = - "More > Hide/Show Native Tabs" allows hiding Zotero's native horizontal tab bar.<br/>- In Plugin Settings, you can enable displaying the Extra field on tabs for annotations; once enabled, the "Edit Extra" option appears in the tab right-click menu.<br/>- Plugin Settings supports enabling a frosted glass effect, though it is not supported in the reader interface.<br/>- Plugin Settings supports customizing category colors.
