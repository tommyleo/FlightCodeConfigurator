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
