import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Utility and filesystem helpers

function getCityFromTz(tz) {
    return tz.split('/').pop().replace(/_/g, ' ');
}

function getSystemTimezones() {
    for (const path of ['/usr/share/zoneinfo/zone1970.tab', '/usr/share/zoneinfo/zone.tab']) {
        try {
            const file = Gio.File.new_for_path(path);
            const [ok, contents] = file.load_contents(null);
            if (!ok) continue;
            const zones = [];
            for (const line of new TextDecoder().decode(contents).split('\n')) {
                if (line.startsWith('#') || !line.trim()) continue;
                const p = line.split('\t');
                if (p.length >= 3) zones.push(p[2].trim());
            }
            if (zones.length) return zones.sort();
        } catch (_) { /* next */ }
    }
    return scanDir('/usr/share/zoneinfo', '').sort();
}

function scanDir(base, prefix) {
    const zones = [], skip = new Set(['posix', 'right']);
    try {
        const iter = Gio.File.new_for_path(base).enumerate_children(
            'standard::name,standard::type', 0, null);
        let info;
        while ((info = iter.next_file(null)) !== null) {
            const name = info.get_name();
            if (name.includes('.')) continue;
            const rel = prefix ? `${prefix}/${name}` : name;
            if (info.get_file_type() === Gio.FileType.DIRECTORY && !skip.has(name))
                zones.push(...scanDir(`${base}/${name}`, rel));
            else if (info.get_file_type() === Gio.FileType.REGULAR && prefix)
                zones.push(rel);
        }
    } catch (_) { /* ignore */ }
    return zones;
}

// Factory functions for GTK/Adwaita preference rows

function spinRow(title, subtitle, lower, upper, step, value) {
    return new Adw.SpinRow({
        title, subtitle,
        adjustment: new Gtk.Adjustment({ lower, upper, step_increment: step,
            page_increment: step * 4, value }),
    });
}

/**
 * Preferences window controller for the World Clock Panel extension.
 * Handles building the multi-page Adw.PreferencesWindow interface.
 */

export default class WorldClockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(760, 720);
        const s = this.getSettings();
        this._s = s;
        this._win = window;
        this._clocksGroup = null;
        this._clockRows   = [];

        this._buildClocksPage(window, s);
        this._buildAppearancePage(window, s);
        this._buildFormatPage(window, s);
    }

    // --- Page 1: Clocks configuration ---

    _buildClocksPage(window, s) {
        const page = new Adw.PreferencesPage({ title: 'Clocks', icon_name: 'preferences-system-time-symbolic' });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Time Zones',
            description: 'Order matches the panel. Click the clock to open these settings.',
        });
        page.add(group);
        this._clocksGroup = group;

        const addBtn = new Gtk.Button({
            icon_name: 'list-add-symbolic', valign: Gtk.Align.CENTER,
            css_classes: ['flat'], tooltip_text: 'Add',
        });
        group.set_header_suffix(addBtn);
        addBtn.connect('clicked', () => this._showAddDialog());

        this._reloadClockRows(s);
    }

    _reloadClockRows(s) {
        for (const r of this._clockRows) this._clocksGroup.remove(r);
        this._clockRows = [];
        const list = s.get_strv('clock-list');
        list.forEach((entry, i) => {
            const pipe  = entry.indexOf('|');
            const tzId  = (pipe >= 0 ? entry.slice(0, pipe) : entry).trim();
            const label = (pipe >= 0 ? entry.slice(pipe + 1) : '').trim();
            const row   = this._makeClockRow(tzId, label, i, list.length, s);
            this._clocksGroup.add(row);
            this._clockRows.push(row);
        });
    }

    _makeClockRow(tzId, label, idx, total, s) {
        const row = new Adw.ActionRow({ title: label || getCityFromTz(tzId), subtitle: tzId });

        const btn = (icon, tip, sensitive = true) => new Gtk.Button({
            icon_name: icon, valign: Gtk.Align.CENTER, css_classes: ['flat'],
            tooltip_text: tip, sensitive,
        });

        const up   = btn('go-up-symbolic',        'Move up',  idx > 0);
        const down = btn('go-down-symbolic',       'Move down', idx < total - 1);
        const edit = btn('document-edit-symbolic', 'Edit');
        const del  = btn('user-trash-symbolic',    'Remove');
        del.add_css_class('destructive-action');

        [up, down, edit, del].forEach(b => row.add_suffix(b));

        up.connect('clicked', () => {
            const l = s.get_strv('clock-list');
            [l[idx - 1], l[idx]] = [l[idx], l[idx - 1]];
            s.set_strv('clock-list', l); this._reloadClockRows(s);
        });
        down.connect('clicked', () => {
            const l = s.get_strv('clock-list');
            [l[idx], l[idx + 1]] = [l[idx + 1], l[idx]];
            s.set_strv('clock-list', l); this._reloadClockRows(s);
        });
        edit.connect('clicked', () => this._showEditDialog(tzId, label, idx, s));
        del.connect('clicked', () => {
            const l = s.get_strv('clock-list');
            l.splice(idx, 1);
            s.set_strv('clock-list', l); this._reloadClockRows(s);
        });
        return row;
    }

    // Dialog window to search and add a new timezone clock

    _showAddDialog() {
        const dialog = new Adw.Dialog({ title: 'Add Clock', content_width: 520, content_height: 660 });
        const tv = new Adw.ToolbarView();
        dialog.set_child(tv);
        tv.add_top_bar(new Adw.HeaderBar());

        const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL,
            margin_start: 12, margin_end: 12, margin_top: 6, margin_bottom: 12, spacing: 10 });
        tv.set_content(box);

        const search = new Gtk.SearchEntry({ placeholder_text: 'Search time zone…' });
        box.append(search);

        const scroll = new Gtk.ScrolledWindow({ vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER, min_content_height: 360 });
        box.append(scroll);

        const listBox = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.SINGLE, css_classes: ['boxed-list'] });
        scroll.set_child(listBox);

        const tzMap = new Map();
        for (const tz of getSystemTimezones()) {
            const r = new Adw.ActionRow({ title: getCityFromTz(tz), subtitle: tz });
            listBox.append(r);
            tzMap.set(r, tz);
        }

        listBox.set_filter_func(row => {
            const q = search.get_text().toLowerCase();
            return !q || (tzMap.get(row) ?? '').toLowerCase().includes(q);
        });
        search.connect('search-changed', () => {
            listBox.invalidate_filter();
            let ch = listBox.get_first_child();
            while (ch) { if (ch.visible) { listBox.select_row(ch); break; } ch = ch.get_next_sibling(); }
        });

        const lg = new Adw.PreferencesGroup();
        box.append(lg);
        const labelRow = new Adw.EntryRow({ title: 'Display name (optional)' });
        lg.add(labelRow);

        // Always auto-fill on selection
        listBox.connect('row-selected', (_lb, sel) => {
            if (!sel) return;
            const tz = tzMap.get(sel);
            if (tz) labelRow.set_text(getCityFromTz(tz));
        });

        const btnBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL,
            halign: Gtk.Align.END, spacing: 8 });
        box.append(btnBox);
        const cancelBtn = new Gtk.Button({ label: 'Cancel' });
        const addBtn    = new Gtk.Button({ label: 'Add', css_classes: ['suggested-action'] });
        btnBox.append(cancelBtn);
        btnBox.append(addBtn);

        cancelBtn.connect('clicked', () => dialog.close());
        addBtn.connect('clicked', () => {
            const sel = listBox.get_selected_row();
            if (!sel) return;
            const tz = tzMap.get(sel);
            if (!tz) return;
            const name = labelRow.get_text().trim() || getCityFromTz(tz);
            const l = this._s.get_strv('clock-list');
            l.push(`${tz}|${name}`);
            this._s.set_strv('clock-list', l);
            this._reloadClockRows(this._s);
            dialog.close();
        });

        dialog.present(this._win);
    }

    // Inline dialog to edit custom label for a timezone clock

    _showEditDialog(tzId, cur, idx, s) {
        const d = new Adw.AlertDialog({ heading: 'Edit Name', body: tzId });
        const e = new Gtk.Entry({ text: cur, placeholder_text: getCityFromTz(tzId), margin_top: 12 });
        d.set_extra_child(e);
        d.add_response('cancel', 'Cancel');
        d.add_response('save',   'Save');
        d.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        d.set_default_response('save');
        d.set_close_response('cancel');
        d.connect('response', (_d, r) => {
            if (r !== 'save') return;
            const l = s.get_strv('clock-list');
            l[idx] = `${tzId}|${e.get_text().trim() || getCityFromTz(tzId)}`;
            s.set_strv('clock-list', l);
            this._reloadClockRows(s);
        });
        d.present(this._win);
    }

    // --- Page 2: Appearance and styling settings ---

    _buildAppearancePage(window, s) {
        const page = new Adw.PreferencesPage({ title: 'Appearance', icon_name: 'applications-graphics-symbolic' });
        window.add(page);

        // Font styling controls (custom size, weight)
        const fontGroup = new Adw.PreferencesGroup({ title: 'Font' });
        page.add(fontGroup);

        const sysRow = new Adw.SwitchRow({
            title: 'System size',
            subtitle: 'Inherits font size from the panel theme',
        });
        sysRow.set_active(s.get_string('font-size-source') === 'system');
        fontGroup.add(sysRow);

        const fsRow = spinRow('Font size', 'px', 8, 48, 1, s.get_int('font-size'));
        fsRow.visible = !sysRow.get_active();
        fontGroup.add(fsRow);

        sysRow.connect('notify::active', () => {
            s.set_string('font-size-source', sysRow.get_active() ? 'system' : 'custom');
            fsRow.visible = !sysRow.get_active();
        });
        fsRow.connect('notify::value', () => s.set_int('font-size', Math.round(fsRow.get_value())));

        const boldRow = new Adw.SwitchRow({ title: 'Bold' });
        boldRow.set_active(s.get_boolean('bold-time'));
        fontGroup.add(boldRow);
        boldRow.connect('notify::active', () => s.set_boolean('bold-time', boldRow.get_active()));

        // Panel element opacity controls
        const opGroup = new Adw.PreferencesGroup({ title: 'Opacity' });
        page.add(opGroup);
        const opRow = spinRow('Opacity', '100 = fully opaque', 10, 100, 5, s.get_int('opacity'));
        opGroup.add(opRow);
        opRow.connect('notify::value', () => s.set_int('opacity', Math.round(opRow.get_value())));

        // Label type and positioning controls
        const labelGroup = new Adw.PreferencesGroup({ title: 'Label' });
        page.add(labelGroup);

        const showLabelRow = new Adw.SwitchRow({ title: 'Show label' });
        showLabelRow.set_active(s.get_boolean('show-label'));
        labelGroup.add(showLabelRow);
        showLabelRow.connect('notify::active', () => s.set_boolean('show-label', showLabelRow.get_active()));

        const labelTypes = [
            { label: 'City  —  New York',                   value: 'city'        },
            { label: 'Abbreviation  —  MSK, ICT, EST',      value: 'abbreviation'},
            { label: 'Abbrev. + city  —  MSK · Moscow',     value: 'abbrev-city' },
            { label: 'Full name  —  Moscow Time',           value: 'tz-long'     },
            { label: 'TZ identifier  —  Europe/Moscow',     value: 'tz-full'     },
            { label: 'Custom text (set per clock)',          value: 'custom'      },
        ];
        const ltRow = new Adw.ComboRow({ title: 'Label type' });
        const ltModel = new Gtk.StringList();
        labelTypes.forEach(t => ltModel.append(t.label));
        ltRow.set_model(ltModel);
        const ltCur = labelTypes.findIndex(t => t.value === s.get_string('label-type'));
        ltRow.set_selected(ltCur >= 0 ? ltCur : 0);
        labelGroup.add(ltRow);
        ltRow.connect('notify::selected', () =>
            s.set_string('label-type', labelTypes[ltRow.get_selected()].value));

        const posValues = ['top', 'bottom', 'left', 'right'];
        const posRow = new Adw.ComboRow({ title: 'Label position' });
        const posModel = new Gtk.StringList();
        ['Top', 'Bottom', 'Left', 'Right'].forEach(l => posModel.append(l));
        posRow.set_model(posModel);
        const posIdx = posValues.indexOf(s.get_string('label-position'));
        posRow.set_selected(posIdx >= 0 ? posIdx : 0);
        labelGroup.add(posRow);
        posRow.connect('notify::selected', () =>
            s.set_string('label-position', posValues[posRow.get_selected()]));

        // Clock divider character configuration
        const sepGroup = new Adw.PreferencesGroup({ title: 'Clock Separator' });
        page.add(sepGroup);
        const sepRow = new Adw.EntryRow({ title: 'Character (empty = no separator)' });
        sepRow.set_text(s.get_string('separator'));
        sepGroup.add(sepRow);
        sepRow.connect('changed', () => s.set_string('separator', sepRow.get_text()));

        // Spacing and gap configuration between panel elements
        const gapGroup = new Adw.PreferencesGroup({ title: 'Spacing' });
        page.add(gapGroup);

        const gapModeRow = new Adw.ActionRow({ title: 'Spacing mode' });
        gapGroup.add(gapModeRow);

        const gapToggle = new Adw.ToggleGroup({ valign: Gtk.Align.CENTER });
        const uniToggle   = new Adw.Toggle({ label: 'Uniform', name: 'uniform' });
        const splitToggle = new Adw.Toggle({ label: 'Split',   name: 'split'   });
        gapToggle.add(uniToggle);
        gapToggle.add(splitToggle);
        gapToggle.set_active_name(s.get_string('gap-mode') || 'uniform');
        gapModeRow.add_suffix(gapToggle);

        const uniRow     = spinRow('Spacing',            'px — between all elements',      -20, 80, 2, s.get_int('gap-uniform'));
        const beforeRow  = spinRow('From system clock',  'px — gap before world clocks',   -20, 80, 2, s.get_int('gap-before'));
        const betweenRow = spinRow('Between clocks',     'px — gap between entries',       0, 80, 2, s.get_int('gap-between'));

        const isSplit = () => gapToggle.get_active_name() === 'split';
        uniRow.visible     = !isSplit();
        beforeRow.visible  =  isSplit();
        betweenRow.visible =  isSplit();

        gapGroup.add(uniRow);
        gapGroup.add(beforeRow);
        gapGroup.add(betweenRow);

        gapToggle.connect('notify::active-name', () => {
            const split = isSplit();
            s.set_string('gap-mode', split ? 'split' : 'uniform');
            uniRow.visible     = !split;
            beforeRow.visible  =  split;
            betweenRow.visible =  split;
        });
        uniRow.connect('notify::value',     () => s.set_int('gap-uniform', Math.round(uniRow.get_value())));
        beforeRow.connect('notify::value',  () => s.set_int('gap-before',  Math.round(beforeRow.get_value())));
        betweenRow.connect('notify::value', () => s.set_int('gap-between', Math.round(betweenRow.get_value())));

        // Position alignment settings (left, center, right)
        const panelGroup = new Adw.PreferencesGroup({ title: 'Panel Position' });
        page.add(panelGroup);

        const boxValues  = ['center', 'right', 'left'];
        const panelRow   = new Adw.ComboRow({ title: 'Panel section' });
        const panelModel = new Gtk.StringList();
        ['Center  (next to system clock)', 'Right', 'Left'].forEach(l => panelModel.append(l));
        panelRow.set_model(panelModel);
        const pbIdx = boxValues.indexOf(s.get_string('panel-box'));
        panelRow.set_selected(pbIdx >= 0 ? pbIdx : 0);
        panelGroup.add(panelRow);
        panelRow.connect('notify::selected', () =>
            s.set_string('panel-box', boxValues[panelRow.get_selected()]));

        const infoRow = new Adw.ActionRow({
            title: 'Changing the section reloads the extension automatically',
            css_classes: ['dim-label'],
        });
        panelGroup.add(infoRow);

        // Restore all keys to default settings
        const resetGroup = new Adw.PreferencesGroup({ title: 'Reset' });
        page.add(resetGroup);

        const resetRow = new Adw.ActionRow({
            title: 'Reset to defaults',
            subtitle: 'Restore all settings to their original values',
        });
        const resetBtn = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        resetRow.add_suffix(resetBtn);
        resetRow.set_activatable_widget(resetBtn);
        resetGroup.add(resetRow);

        resetBtn.connect('clicked', () => {
            const d = new Adw.AlertDialog({
                heading: 'Reset to Defaults?',
                body: 'All settings will be restored to their original values. This cannot be undone.',
            });
            d.add_response('cancel', 'Cancel');
            d.add_response('reset',  'Reset');
            d.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
            d.set_default_response('cancel');
            d.set_close_response('cancel');
            d.connect('response', (_d, r) => {
                if (r !== 'reset') return;
                for (const key of s.settings_schema.list_keys()) s.reset(key);
            });
            d.present(this._win);
        });
    }

    // --- Page 3: Date and Time format settings ---

    _buildFormatPage(window, s) {
        const page = new Adw.PreferencesPage({ title: 'Format', icon_name: 'document-edit-symbolic' });
        window.add(page);

        // Time display format configuration (12h, 24h, custom strftime)
        const tg = new Adw.PreferencesGroup({ title: 'Time' });
        page.add(tg);

        const timeFormats = [
            { label: '14:30  — 24 h',                  value: '%H:%M'       },
            { label: '02:30 PM  — 12 h',               value: '%I:%M %p'    },
            { label: '14:30:45  — 24 h + seconds',     value: '%H:%M:%S'    },
            { label: '02:30:45 PM  — 12 h + seconds',  value: '%I:%M:%S %p' },
            { label: 'Custom format…',                  value: '__custom__'  },
        ];
        const tfRow = new Adw.ComboRow({ title: 'Format' });
        const tfModel = new Gtk.StringList();
        timeFormats.forEach(f => tfModel.append(f.label));
        tfRow.set_model(tfModel);
        const curTf = s.get_string('time-format');
        let tfIdx = timeFormats.findIndex(f => f.value === curTf);
        if (tfIdx < 0) tfIdx = timeFormats.length - 1;
        tfRow.set_selected(tfIdx);
        tg.add(tfRow);

        const customTf = new Adw.EntryRow({ title: 'Custom strftime format', visible: tfIdx === timeFormats.length - 1 });
        customTf.set_text(curTf);
        tg.add(customTf);

        tfRow.connect('notify::selected', () => {
            const i = tfRow.get_selected();
            customTf.visible = i === timeFormats.length - 1;
            if (i < timeFormats.length - 1) s.set_string('time-format', timeFormats[i].value);
        });
        customTf.connect('changed', () => {
            if (tfRow.get_selected() === timeFormats.length - 1)
                s.set_string('time-format', customTf.get_text());
        });

        const secRow = new Adw.SwitchRow({
            title: 'Show seconds',
            subtitle: 'Appends :SS if not already in format',
        });
        secRow.set_active(s.get_boolean('show-seconds'));
        tg.add(secRow);
        secRow.connect('notify::active', () => s.set_boolean('show-seconds', secRow.get_active()));

        // Date display format configuration (custom strftime)
        const dg = new Adw.PreferencesGroup({ title: 'Date' });
        page.add(dg);

        const showDate = new Adw.SwitchRow({ title: 'Show date' });
        showDate.set_active(s.get_boolean('show-date'));
        dg.add(showDate);
        showDate.connect('notify::active', () => s.set_boolean('show-date', showDate.get_active()));

        const dateFormats = [
            { label: '24/05',           value: '%d/%m'      },
            { label: '05/24',           value: '%m/%d'      },
            { label: '24.05.2025',      value: '%d.%m.%Y'   },
            { label: 'Sat, 24 May',     value: '%a, %d %b'  },
            { label: 'Custom format…',  value: '__custom__' },
        ];
        const dfRow = new Adw.ComboRow({ title: 'Format' });
        const dfModel = new Gtk.StringList();
        dateFormats.forEach(f => dfModel.append(f.label));
        dfRow.set_model(dfModel);
        const curDf = s.get_string('date-format');
        let dfIdx = dateFormats.findIndex(f => f.value === curDf);
        if (dfIdx < 0) dfIdx = dateFormats.length - 1;
        dfRow.set_selected(dfIdx);
        dg.add(dfRow);

        const customDf = new Adw.EntryRow({ title: 'Custom strftime format', visible: dfIdx === dateFormats.length - 1 });
        customDf.set_text(curDf);
        dg.add(customDf);

        dfRow.connect('notify::selected', () => {
            const i = dfRow.get_selected();
            customDf.visible = i === dateFormats.length - 1;
            if (i < dateFormats.length - 1) s.set_string('date-format', dateFormats[i].value);
        });
        customDf.connect('changed', () => {
            if (dfRow.get_selected() === dateFormats.length - 1)
                s.set_string('date-format', customDf.get_text());
        });

        // Helper quick reference for standard strftime parameters
        const rg = new Adw.PreferencesGroup({ title: 'strftime Reference' });
        page.add(rg);
        for (const [title, sub] of [
            ['%H · %I · %M · %S · %p',  'Hours 24 h · Hours 12 h · Minutes · Seconds · AM/PM'],
            ['%d · %m · %Y · %y',        'Day · Month · Year 4-digit · Year 2-digit'],
            ['%a · %A · %b · %B · %Z',   'Short day · Full day · Short month · Full month · TZ abbrev.'],
        ])
            rg.add(new Adw.ActionRow({ title, subtitle: sub }));
    }
}
