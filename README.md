# FlightCode Configurator

1. Compilare e caricare `C:\SvilST\FlightCode\build\debug\FlightCode-MAMBAF411.hex` tramite DFU.
2. Riavviare la flight controller normalmente, senza tenere premuto BOOT.
3. Avviare `start-configurator.cmd`.
4. In Chrome o Edge premere **Connetti** e scegliere `FlightCode USB Configurator`.

Il configuratore mostra telemetria IMU, 16 canali SBUS, motori e consente di
leggere, applicare e salvare i PID. Per sicurezza i comandi che modificano o
salvano i PID vengono rifiutati quando il firmware è armato.
