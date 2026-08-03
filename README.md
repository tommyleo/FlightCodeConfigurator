# FlightCode Configurator

Shared Web Serial configurator for FlightCode firmware on STM32F4 and
FlightCodePI on Raspberry Pi Pico 2 W. Protocol v3 automatically detects the
available features and adapts the interface to the connected board.

FlightCodePI exposes every configurator feature: PID settings, rates/expo,
feedforward, TPA, alignment, motor protocol and idle, calibration, protected
PID diagnostics, flight logs, and USB BOOTSEL mode.

1. Build and flash the appropriate FlightCode or FlightCodePI firmware.
2. Restart the flight controller normally without holding BOOT.
3. Launch `start-configurator.cmd`.
4. In Chrome or Edge, select **Connect** and choose the FlightCode device.

The configurator displays IMU telemetry, 16 SBUS channels, and motor outputs.
It can read, apply, and persist all supported flight settings. For safety, the
firmware rejects configuration changes while the flight controller is armed.

## STM32 firmware flashing

The **Firmware** tab can flash FlightCode Intel HEX builds to MAMBAF411 and
CLRACINGF4 boards directly from Chrome or Edge through WebUSB:

1. Keep the LiPo disconnected and connect the flight controller by USB.
2. Select the correct target and its matching `.hex` file.
3. Restart the connected board in DFU mode, or enter DFU with its BOOT button.
4. Select **Connect DFU**, confirm the safety check, then select
   **Flash firmware**.

The configurator validates the HEX target and address range, erases only the
application sectors, verifies every programmed byte, and then restarts the
flight controller. The reserved settings and flight-log sectors are preserved.
