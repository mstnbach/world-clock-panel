# World Clock Panel

A polished, highly customizable GNOME Shell extension that displays unlimited world clocks on your top panel. Perfect for developers, remote teams, and global citizens who need to track multiple time zones at a glance.

Developed with a native look and feel using **ESM modules**, **GTK4**, and **Libadwaita** for the preferences interface.

---

## 📸 Screenshots

| Clocks Configuration & Appearance | Spacing & Formatting Preferences |
|:---:|:---:|
| ![Settings Overview](./Screenshot%20From%202026-05-24%2023-47-28.png) | ![More Customization](./Screenshot%20From%202026-05-24%2023-47-32.png) |

---

## ✨ Features

- 🌍 **Unlimited Clocks:** Add and track as many global time zones as you need.
- 📍 **Flexible Panel Alignment:** Position the clocks in the **Center** (directly next to the system clock), **Left**, or **Right** panel sections.
- 🏷️ **Dynamic & Custom Labels:** 
  - Choose between City, Timezone Abbreviation (e.g. *MSK*, *EST*), combined Abbreviation + City, Full Timezone Name, or a **completely custom label** per clock.
  - Position labels relative to the clock: **Top**, **Bottom**, **Left**, or **Right**.
  - DST-aware dynamic labels keep abbreviations accurate during seasonal shifts.
- 📐 **Precise Spacing (Split Mode):**
  - **Uniform:** Apply the same spacing between all elements.
  - **Split:** Specify separate spacing between the system clock and your world clocks vs. spacing *between* individual world clocks.
- 🎨 **Appearance Controls:**
  - Font size adjustment (inherit system size or set a custom size in pixels).
  - Toggle bold weight for time displays.
  - Separate opacity levels for the time and auxiliary text (labels/dates).
- 🕒 **Custom Formats (`strftime`):** Customize time and date output formats precisely (12h, 24h, or write your own custom `strftime` string). Toggles for displaying seconds and dates.
- ⚙️ **Modern Preferences GUI:** Beautiful, responsive UI built natively on **Libadwaita** featuring direct interactive timezone search.
- ⚡ **Hot Reloading:** Install, update, or reload settings seamlessly on **Wayland** or **X11** sessions without having to log out.

---

## 🚀 Installation & Update

### 1. Requirements
Make sure you have GNOME GSettings schemas compiler installed. On Ubuntu/Debian:
```bash
sudo apt install libglib2.0-bin
```

### 2. Quick Install
Clone the repository and run the provided install script:
```bash
git clone https://github.com/YOUR_USERNAME/world-clock-panel.git
cd world-clock-panel
chmod +x install.sh
./install.sh
```
*Note: The script compiles the GSettings schema and automatically reloads the extension via D-Bus, so changes will take effect immediately without requiring a shell reload or logout.*

---

## 🛠️ Usage

1. **Open Settings:** Simply **left-click** on any of your world clocks in the panel to open the preferences window instantly.
2. **Add Clock:** Click the `+` button in the top right, search for your desired city or timezone, set an optional custom name, and click **Add**.
3. **Reorder/Remove:** Reorder clocks using the Up/Down arrows, or click the trash icon to remove a clock.
4. **Customize Appearance:** Head over to the **Appearance** and **Format** tabs to fine-tune spacing, font weights, opacity, and time formats.

---

## 📜 License

Distributed under the **GPL-3.0 License**. See the `LICENSE` file for more details.
