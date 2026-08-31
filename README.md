# FlightCode Configurator

Current release: **1.0.0**.

Shared Web Serial configurator for FlightCode firmware on STM32F4 and
FlightCodePI on Raspberry Pi Pico 2 W. Protocol v3 automatically detects the
available features and adapts the interface to the connected board.

## Firmware projects

- **[FlightCode](https://github.com/tommyleo/FlightCode)** — firmware for
  supported STM32 flight controllers, including analog and HD targets,
  microSD or internal-flash Blackbox where available, OSD, receiver setup,
  diagnostics, and STM32 DFU flashing.
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
Setup distinguishes the selectable main-scheduler frequency from the live
gyroscope/PID frequency. PID updates are synchronized to fresh gyroscope
samples, while motor output and timed system tasks follow the main scheduler.
It can read, apply, and persist all supported flight settings. For safety, the
firmware rejects configuration changes while the flight controller is armed.

On `FLYWOOF405NANO` and `HDZERO_HALO`, the Camera OSD tab controls the MSP
DisplayPort overlay using an HDZero-compatible 30 × 16 canvas centered in the
HD display. The VTX tab selects `HDZERO_MSP` and the connected UART; Flywoo HD
defaults to UART6 and Halo defaults to UART5 on a fresh firmware configuration.
Analog targets continue to use their MAX7456/AT7456E backend.

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
| OSD layout editor | Analog, drag-and-drop | Analog, drag-and-drop | MSP DisplayPort, 30 × 16 centered | Analog, drag-and-drop | Firmware dependent |
| RAM flight-log download | Yes | Yes | Yes | Yes | Yes |
| Persistent Blackbox | No | microSD, multiple-flight catalog | 16 MiB internal flash, latest flight | 16 MiB internal flash, latest flight | No |
| Blackbox write/session diagnostics | No | Storage status | Yes | Yes | No |
| Firmware update | STM32 DFU/HEX | STM32 DFU/HEX | STM32 DFU/HEX | STM32 DFU/HEX | RP2350 BOOTSEL/UF2 |

On CLRACINGF4, both Flywoo Nano targets and FlightCodePI, Setup exposes a persistent VBAT multiplier
for final voltage calibration. The firmware starts from Betaflight's standard
scale 110, while the multiplier defaults to 1.000.

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

- MAMBAF411, CLRACINGF4, FLYWOOF405NANO, and FLYWOOF405NANO_ANALOG use STM32 DFU with a matching
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
