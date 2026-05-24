import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// Time zone label formatting helpers

function getCityFromTz(tz) {
    return tz.split('/').pop().replace(/_/g, ' ');
}

// Label types that require a dynamic DateTime object to handle DST correctly
const DYNAMIC_TYPES = new Set(['abbreviation', 'abbrev-city']);

function computeLabel(tzId, stored, type, dt) {
    switch (type) {
    case 'abbreviation':
        return dt?.format('%Z') ?? getCityFromTz(tzId);

    case 'abbrev-city': {
        const abbrev = dt?.format('%Z') ?? '';
        const city   = getCityFromTz(tzId);
        return abbrev ? `${abbrev} · ${city}` : city;
    }

    case 'tz-long': {
        try {
            const parts = new Intl.DateTimeFormat(undefined, {
                timeZone: tzId, timeZoneName: 'long',
            }).formatToParts(new Date());
            return parts.find(p => p.type === 'timeZoneName')?.value ?? getCityFromTz(tzId);
        } catch (_) {
            return getCityFromTz(tzId);
        }
    }

    case 'tz-full':
        return tzId;

    case 'custom':
        return stored || getCityFromTz(tzId);

    default: // 'city'
        return getCityFromTz(tzId);
    }
}

/**
 * Main World Clock panel indicator widget.
 * Inherits from PanelMenu.Button to display timezone clocks on the GNOME panel.
 */

const WorldClockIndicator = GObject.registerClass(
class WorldClockIndicator extends PanelMenu.Button {
    _init(ext) {
        super._init(0.0, 'World Clock Panel', true);
        this.add_style_class_name('world-clock-indicator');
        this._ext      = ext;
        this._settings = ext.getSettings();
        this._clocks   = [];
        this._timerId  = null;
        this.y_expand  = true;

        this._box = new St.BoxLayout({
            style_class: 'world-clock-panel-box',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._box);

        this.connect('button-press-event', (_a, ev) => {
            if (ev.get_button() === 1) { this._ext.openPreferences(); return Clutter.EVENT_STOP; }
            return Clutter.EVENT_PROPAGATE;
        });

        this._changedId = this._settings.connect('changed', () => this._rebuild());
        this._rebuild();
    }

    // Rebuild the indicator layout and child widgets based on current settings

    _rebuild() {
        this._stopTimer();
        this._box.destroy_all_children();
        this._clocks = [];

        const s    = this._settings;
        const list = s.get_strv('clock-list');
        if (!list.length) { this.hide(); return; }
        this.show();

        const fsSource   = s.get_string('font-size-source');
        const fs         = s.get_int('font-size');
        const opPct      = s.get_int('opacity');
        const opTime     = Math.round(opPct * 2.55);
        const opMeta     = Math.min(255, Math.round(opTime * 0.72));
        const bold       = s.get_boolean('bold-time');
        const showLabel  = s.get_boolean('show-label');
        const labelType  = s.get_string('label-type');
        const labelPos   = s.get_string('label-position');
        const gapMode    = s.get_string('gap-mode');
        const gapBefore  = gapMode === 'split' ? s.get_int('gap-before')  : s.get_int('gap-uniform');
        const gapBetween = gapMode === 'split' ? s.get_int('gap-between') : s.get_int('gap-uniform');
        const sepChar    = s.get_string('separator');
        const labelFs    = Math.max(8, Math.round(fs * 0.78));
        const custom     = fsSource === 'custom';

        // Handle custom panel margins:
        // A positive gap pushes the indicator right via margin-left (affects layout width).
        // A negative gap shifts content left via translation_x so the footprint is unchanged,
        // preventing the parent panel box from recalculating positions repeatedly.
        this.style = gapBefore >= 0 ? `margin-left:${gapBefore}px;` : null;
        this._box.translation_x = gapBefore < 0 ? gapBefore : 0;
        this._box.style = `spacing:${gapBetween}px;`;

        const timeStyle = [
            custom ? `font-size:${fs}px` : '',
            bold   ? 'font-weight:bold'  : '',
        ].filter(Boolean).join(';');

        const metaStyle = custom ? `font-size:${labelFs}px` : '';

        const horizontal = labelPos === 'left' || labelPos === 'right';

        list.forEach((entry, i) => {
            const pipe   = entry.indexOf('|');
            const tzId   = (pipe >= 0 ? entry.slice(0, pipe) : entry).trim();
            const stored = (pipe >= 0 ? entry.slice(pipe + 1) : '').trim();

            // Insert separator between multiple clocks if configured
            if (i > 0 && sepChar) {
                const sepW = new St.Label({
                    text: sepChar,
                    y_align: Clutter.ActorAlign.CENTER,
                    style: custom ? `font-size:${fs}px` : '',
                });
                sepW.opacity = opMeta;
                this._box.add_child(sepW);
            }

            // Build the layout box for the clock entry (label, time, date)
            const col = new St.BoxLayout({
                style_class: 'world-clock-panel-col',
                style: `spacing:${horizontal ? 5 : 1}px;`,
                vertical: !horizontal,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                clip_to_allocation: true,
            });

            // Compute the initial label text, passing a DateTime object for dynamic DST-aware labels
            let dt = null;
            try { dt = GLib.DateTime.new_now(GLib.TimeZone.new(tzId)); } catch (_) {}

            const labelText = showLabel ? computeLabel(tzId, stored, labelType, dt) : '';

            const labelW = labelText
                ? (() => {
                    const w = new St.Label({
                        text: labelText,
                        x_align: Clutter.ActorAlign.CENTER,
                        y_align: Clutter.ActorAlign.CENTER,
                        style: metaStyle,
                    });
                    w.opacity = opMeta;
                    return w;
                })()
                : null;

            const timeLabel = new St.Label({
                text: '--:--',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                style: timeStyle,
            });
            timeLabel.opacity = opTime;

            const dateLabel = new St.Label({
                text: '',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                style: metaStyle,
                visible: false,
            });
            dateLabel.opacity = opMeta;

            // Arrange widgets according to chosen label position (vertical or horizontal alignment)
            if (horizontal) {
                if (labelPos === 'left'  && labelW) col.add_child(labelW);
                col.add_child(timeLabel);
                col.add_child(dateLabel);
                if (labelPos === 'right' && labelW) col.add_child(labelW);
            } else {
                if (labelPos === 'top'    && labelW) col.add_child(labelW);
                col.add_child(timeLabel);
                col.add_child(dateLabel);
                if (labelPos === 'bottom' && labelW) col.add_child(labelW);
            }

            this._box.add_child(col);
            this._clocks.push({
                tzId, stored, timeLabel, dateLabel, labelW,
                needsDynamic: showLabel && DYNAMIC_TYPES.has(labelType),
            });
        });

        this._tick();
        this._startTimer();
    }

    // Periodic tick to update displayed times and dynamic labels

    _tick() {
        const s        = this._settings;
        const timeFmt  = s.get_string('time-format');
        const showSec  = s.get_boolean('show-seconds');
        const showDate = s.get_boolean('show-date');
        const dateFmt  = s.get_string('date-format');
        const lType    = s.get_string('label-type');
        const fmt      = (showSec && !timeFmt.includes('%S')) ? `${timeFmt}:%S` : timeFmt;

        for (const { tzId, stored, timeLabel, dateLabel, labelW, needsDynamic } of this._clocks) {
            try {
                const tz = GLib.TimeZone.new(tzId);
                const dt = GLib.DateTime.new_now(tz);

                timeLabel.set_text(dt.format(fmt) ?? '??:??');

                if (needsDynamic && labelW)
                    labelW.set_text(computeLabel(tzId, stored, lType, dt));

                if (showDate) { dateLabel.set_text(dt.format(dateFmt) ?? ''); dateLabel.show(); }
                else            dateLabel.hide();
            } catch (_) {
                timeLabel.set_text('?tz?');
            }
        }
    }

    _startTimer() {
        const iv = this._settings.get_boolean('show-seconds') ? 1 : 10;
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, iv, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTimer() {
        if (this._timerId !== null) { GLib.source_remove(this._timerId); this._timerId = null; }
    }

    destroy() {
        this._settings.disconnect(this._changedId);
        this._stopTimer();
        super.destroy();
    }
});

/**
 * Extension entry point class managing the enabling and disabling
 * of the panel indicator.
 */

export default class WorldClockPanelExtension extends Extension {
    enable() {
        this._settings    = this.getSettings();
        this._boxChanged  = this._settings.connect('changed::panel-box', () => {
            this._remove();
            this._add();
        });
        this._add();
    }

    _add() {
        this._indicator = new WorldClockIndicator(this);
        const box = this._settings.get_string('panel-box');
        if (box === 'right')
            Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
        else if (box === 'left')
            Main.panel.addToStatusArea(this.uuid, this._indicator, -1, 'left');
        else
            Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'center');
    }

    _remove() {
        this._indicator?.destroy();
        this._indicator = null;
    }

    disable() {
        this._settings?.disconnect(this._boxChanged);
        this._settings = null;
        this._remove();
    }
}
