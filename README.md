# FlightCode Configurator

Current development version: **1.6.4** (not released).

## FlightCode in action! 🚀

**[Watch the flight video on YouTube](https://youtu.be/JjHND97abkM)**

Shared Web Serial configurator for FlightCode firmware on STM32F4/F7/H7, AT32F435 and
FlightCodePI on Raspberry Pi Pico 2 W. Protocol v3 automatically detects the
available features and adapts the interface to the connected board.

## Firmware projects

- **[FlightCode](https://github.com/tommyleo/FlightCode)** — firmware for
  supported STM32 and AT32 flight controllers, including analog and HD targets,
  microSD or internal-flash Blackbox where available, OSD, receiver setup,
  diagnostics, and STM32 / AT32 DFU flashing.
- **[FlightCodePI](https://github.com/tommyleo/FlightCodePI)** — firmware for
  Raspberry Pi Pico 2 and Pico 2 W boards, with SBUS, DSHOT, configurable flight
  control, protected diagnostics, onboard flight logs, and RP2350 UF2 flashing.

Choose the firmware repository that matches the flight-controller processor;
both projects use this Configurator and the same capability-driven interface.

FlightCodePI exposes every configurator feature: PID settings, rates/expo,
feedforward, TPA, gyroscope and D-term filters, alignment, motor protocol and
idle, calibration, protected PID diagnostics, flight logs, and USB BOOTSEL
mode.

1. Build and flash the appropriate FlightCode or FlightCodePI firmware.
2. Restart the flight controller normally without holding BOOT.
3. Launch `start-configurator.cmd`.
4. In Chrome or Edge, select **Connect**. The configurator automatically opens
   an authorized FlightCode device, otherwise an authorized Raspberry Pi; when
   neither is available it displays the normal serial-port selector.

## IIS deployment

The configurator is a static website. Publish the contents of `dist` as the IIS
site root and configure a valid HTTPS binding; Web Serial and WebUSB are only
available to secure browser contexts. The included `web.config` selects
`index.html` as the default document, registers firmware download MIME types,
and grants the site access to the serial and USB browser capabilities.

Regenerate the publication folder and its `web.zip` package from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-dist.ps1
```

## Unified desktop, web and Android build

The Android application embeds the same HTML, CSS and JavaScript sources used
by the web configurator. Its native USB bridge supplies CDC serial access to
the shared application, so configuration, telemetry, diagnostics and log
downloads do not require Web Serial or WebUSB support from Android WebView.

Build every distributable with:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-all.ps1
```

The command regenerates `dist`, creates `output/desktop` and `desktop.zip`,
synchronizes `output/mobile`, and, when Gradle and the Android SDK are
available, creates `output/FlightCodeConfigurator-debug.apk`. Use
`-SkipAndroidBuild` to generate and synchronize all source folders on a machine
without the Android toolchain. The `android` folder can also be opened and built
directly in Android Studio.

Firmware flashing remains available in the web/desktop build. The Android app
currently provides the complete CDC configurator connection; native STM32 DFU
and RP2350 Picoboot flashing require the planned bootloader extension to the
Android USB bridge.

On Android, use an up-to-date Chrome release and a USB OTG data cable. The
configurator uses WebUSB CDC directly on Android, avoiding vendor-specific
Android Serial Service availability. Desktop Chrome and Edge continue to use
Web Serial. iOS does not expose the wired connection used by this configurator.

The configurator displays IMU telemetry, 16 SBUS channels, and motor outputs.
Setup provides separate scheduler and gyroscope/PID frequency selectors using
the rates reported by the connected firmware. The gyro/PID rate cannot exceed
the scheduler rate. PID updates are synchronized to fresh gyroscope samples,
while motor output and timed system tasks follow the main scheduler.
It can read, apply, and persist all supported flight settings. For safety, the
firmware rejects configuration changes while the flight controller is armed.

On `FLYWOOF405NANO` and `HDZERO_HALO`, the Camera OSD tab controls the MSP
DisplayPort overlay using an HDZero-compatible 30 × 16 canvas centered in the
HD display. The VTX tab selects `HDZERO_MSP` and the connected UART; Flywoo HD
defaults to UART4 (UART6 is reserved for integrated ELRS) and Halo defaults to UART5 on a fresh firmware configuration.
All supported STM32 targets can use MSP + DisplayPort on a free UART.
HDZero control requires both signal wires: FC TX to VTX RX, FC RX to VTX TX,
and ground. The firmware sends band/channel and 25/200 mW power settings;
frequency comes from the native HDZero table. The live MSP status confirms
communication and queued settings, not RF readback. FlightCodePI uses GP4 TX
and GP5 RX. Save and reboot to activate the selected UART.
Boards with a MAX7456/AT7456E chip can also use analog OSD. On the SEQURE H743 V2 target,
the OSD editor can display battery
current as a whole-ampere value such as `45 A`, provided the current-sensor
input has been connected and calibrated. The board target has compiled but
has not yet been validated on physical hardware.

On CLRACINGF4, the Blackbox page lists microSD flights retained across power
cycles. On both Flywoo Nano targets it manages the internal 16 MiB flash and
its latest retained flight. These targets download indexed flights as FlightCode JSON logs
and provide a protected catalog-clear action. FlightCodePI does not expose
persistent Blackbox storage.

## Board feature matrix

The interface is capability-driven: unsupported pages and controls are hidden
or disabled after connection.

| Configurator feature | MAMBAF411 | CLRACINGF4 | FLYWOOF405NANO | FLYWOOF405NANO_ANALOG | FlightCodePI |
| --- | --- | --- | --- | --- | --- |
| PID, rates, expo, FF, TPA | Yes | Yes | Yes | Yes | Yes |
| Balanced/Racing/Freestyle profiles | Yes | Yes | Yes | Yes | Yes |
| Gyro and D-term filters | Yes | Yes | Yes | Yes | Yes |
| Board alignment and live attitude | Yes | Yes | Yes | Yes | Yes |
| SBUS channel view and receiver setup | Yes | Yes | Yes | Yes | Firmware dependent |
| Motor protocol, direction, idle and test | Yes | Yes | Yes | Yes | Yes |
| Guided IMU calibration | Yes | Yes | Yes | Yes | Yes |
| Guided PID/mixer simulation | Yes | Yes | Yes | Yes | Yes |
| Battery voltage telemetry | Yes | Yes | Yes | Yes | Yes |
| OSD layout editor | Analog / MSP DisplayPort | Analog / MSP DisplayPort | MSP DisplayPort, 30 × 16 centered | Analog / MSP DisplayPort | Firmware dependent |
| RAM flight-log download | Yes | Yes | Yes | Yes | Yes |
| Persistent Blackbox | No | microSD, multiple-flight catalog | 16 MiB internal flash, latest flight | 16 MiB internal flash, latest flight | No |
| Blackbox write/session diagnostics | No | Storage status | Yes | Yes | No |
| Firmware update | STM32 DFU/HEX | STM32 DFU/HEX | STM32 DFU/HEX | STM32 DFU/HEX | RP2350 BOOTSEL/UF2 |

On CLRACINGF4, both Flywoo Nano targets and FlightCodePI, Setup exposes a persistent VBAT multiplier
for final voltage calibration. The firmware uses a nominal 11:1 voltage-divider ratio, while the multiplier defaults to 1.000.

The Flywoo Blackbox page exposes flash readiness, used bytes, dropped records,
the retained-flight catalog, JSON download, erase, physical **Write test** and
synthetic **Session test**. Failures include the operation, status register and
flash address so storage faults can be diagnosed without flying.

## Available configuration and diagnostics

- Read, apply and save PID, rates/expo, progressive feedforward, TPA and filter
  values; select Balanced, Racing or Freestyle starting profiles.
- Configure TAER/AETR receiver order, arm channel/range, motor order,
  direction, idle and supported ESC protocol.
- View live attitude, gyro, receiver, motor, battery and loop telemetry.
- Run protected motor, guided IMU and simulated PID/mixer tests while disarmed.
- Download RAM or persistent Blackbox logs as versioned FlightCode JSON,
  including setpoints, gyro, motors, battery, measured main-scheduler and
  gyro/PID periods and frequencies, plus separated P/I/D/FF terms.
- Request DFU/BOOTSEL from a connected controller or enter it manually with the
  board BOOT button when USB reset is unavailable.

## Firmware flashing

The **Firmware** tab detects the connected board and selects its matching
bootloader and firmware format:

- MAMBAF411, CLRACINGF4, FLYWOOF405NANO, FLYWOOF405NANO_ANALOG, and SEQUREH7V2 use STM32 DFU with a matching
  FlightCode `.hex` file.
- Raspberry Pi Pico 2 W uses RP2350 Picoboot with a FlightCodePI `.uf2` file.

Both paths run directly from Chrome or Edge through WebUSB:

1. Keep the LiPo disconnected and connect the flight controller by USB.
2. Select the correct target and its matching firmware file.
3. Restart the connected board in DFU or BOOTSEL mode, or use its BOOT button.
4. Connect the detected bootloader, then select **Flash firmware**.

The configurator validates the HEX or UF2 target and address range, erases only
application memory, verifies every programmed byte, and then restarts the
flight controller. Reserved settings and flight-log storage are preserved. On
success, the Firmware tab is reset for the next operation.

## Hummingbird 200 RaceSpec (development target)

Select `HUMMINGBIRD_200RS` to use its matching FlightCode HEX. The native
AT32F435 port has not yet been bench tested. The Configurator recognizes
firmware CDC `2E3C:5740` and ROM DFU `2E3C:DF11`, reserves UART1 for the integrated
CRSF/ELRS receiver, and offers UART5/UART7 for VTX. Flashing erases only occupied
application pages and verifies their contents; the final 2 KiB settings page
is excluded. AT32 DFU requires WebUSB and a suitable USB driver on Windows.
Android supports normal CDC configuration; browser DFU remains a WebUSB feature.

The top-right status bar shows **Current draw** beside voltage with two decimal places on
boards reporting `BATTERY_CURRENT`. A missing sensor or disconnected board shows
`— A`. This value is instantaneous amperage, not consumed capacity in mAh.

On SEQURE H7 with diagnostic firmware, hover over current to see sensor voltage,
sample count, sample age and conversion errors. Stale ADC samples show — A.


## Complete configuration backup

The two controls above the configuration tabs are **Save backup** and **Load backup**. They work with FlightCode and FlightCodePI on every supported target after installing firmware advertising `SETTINGS_BACKUP`. Older firmware is detected and the controls explain that an update is needed; the Configurator never labels an incomplete export as a full backup.

Save backup reads a consistent snapshot of the entire board settings structure directly from the firmware, including fields not currently visible or associated with unpowered peripherals. It downloads a JSON file containing board model, firmware family/version, settings layout version, payload length, a CRC32 checksum and the complete byte-exact settings payload. Local edits that have not been applied to the board are not included. Flight logs, ESC firmware/settings and transient gyro calibration are separate from the FC settings backup.

Load backup validates the complete file, board model, firmware family and settings layout before sending it. The firmware stages all chunks without changing active settings, verifies their order and CRC, then validates and saves the settings. The Configurator reads the entire result back before reporting success. Disconnects, timeouts, malformed files and incompatible boards stop the operation. If flash saving fails, the firmware restores the previous settings in RAM and reports failure; this is not a guarantee that a failed flash write preserved the previous persistent record. After a successful read-back verification, the Configurator automatically reboots the FC so all peripherals use the restored configuration. Reconnect when its USB port returns. Failed restores do not trigger a reboot.

Android uses the system file picker for both operations and does not request broad storage access. Desktop/web use the standard download and file selector.

Before trying Betaflight: first update the Configurator and the same FlightCode target using the Configurator Firmware tab, which preserves the reserved settings sectors; the backup update does not change the existing settings structure, version or storage address. Reconnect, save the backup file and keep it. After reinstalling compatible FlightCode on that same target, load the file; the Configurator verifies it and reboots the board automatically. These JSON files cannot be imported into Betaflight. Do not use full-chip erase when the goal is to preserve the existing settings before the first backup.

Validation: `node --test tests/*.test.js tests/*.cjs` includes full transactions for all current FlightCode targets and FlightCodePI, corrupt files, wrong board/schema, disconnects, timeouts and read-back comparison. Firmware protocol regression: compile `tests/settings_backup_test.c` with `-Isrc/protocol` in the FlightCode repository.

Backup read resilience (2026-10-18): GET_SETTINGS_INFO and GET_SETTINGS_CHUNK may retry up to three times if a response times out. Disconnects and explicit firmware errors stop immediately. Restore begin/chunk/commit commands are never retried automatically. Index script URLs were changed so reloading picks up the updated client. On the real SEQURE H7, direct settings queries and a complete read-only browser backup succeeded; the reported restore-preflight timeout was not reproduced in that probe. A firmware capability-line truncation was observed on the device and fixed separately. No settings or firmware were written during the read-only diagnosis.

## Pico 2 / Pico 2 W serial assignments (development firmware 1.6.4)

The Pico reports logical ports **UART1** (GP0/GP1) and **UART2** (GP2/GP3).
Both selectors offer both ports: assign the receiver and VTX to different ports.
Defaults are receiver UART1 and VTX UART2. These logical names do not identify
the RP2350 hardware UART instances; the receiver uses PIO. Older Pico firmware
reporting PIO0/UART1 retains its fixed assignments in the Configurator.

| Function | UART1 | UART2 |
|---|---|---|
| Receiver | GP0 RX, GP1 TX (bind only) | GP2 RX, GP3 TX (bind only) |
| VTX / MSP DisplayPort | GP0 TX, GP1 RX | GP2 TX, GP3 RX |

To swap assignments, disable VTX and apply, select and apply the receiver port,
then select the other VTX port and re-enable/apply VTX. Save both settings.
Rewire with power disconnected: TX/RX directions depend on the selected function.
