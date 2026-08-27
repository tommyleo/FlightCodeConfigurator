package com.flightcode.configurator;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final String USB_PERMISSION = "com.flightcode.configurator.USB_PERMISSION";
    private WebView webView;
    private AndroidUsbBridge usbBridge;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        usbBridge = new AndroidUsbBridge(this, webView);
        webView.addJavascriptInterface(usbBridge, "AndroidUsb");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/configurator/index.html?platform=android");
    }

    @Override public void onDestroy() {
        usbBridge.shutdown();
        webView.destroy();
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    static final class AndroidUsbBridge {
        private final Activity activity;
        private final WebView webView;
        private final UsbManager manager;
        private final ExecutorService io = Executors.newSingleThreadExecutor();
        private UsbDevice device;
        private UsbDeviceConnection connection;
        private UsbInterface controlInterface;
        private UsbInterface dataInterface;
        private UsbEndpoint input;
        private UsbEndpoint output;
        private volatile boolean reading;
        private int baudRate = 115200;

        private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(intent.getAction())) {
                    UsbDevice removed = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    if (device != null && removed != null && device.getDeviceId() == removed.getDeviceId()) close(true);
                    return;
                }
                if (!USB_PERMISSION.equals(intent.getAction())) return;
                UsbDevice selected = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false) && selected != null) open(selected);
                else callback("_error", "USB permission denied");
            }
        };

        AndroidUsbBridge(Activity activity, WebView webView) {
            this.activity = activity;
            this.webView = webView;
            manager = (UsbManager) activity.getSystemService(Context.USB_SERVICE);
            IntentFilter filter = new IntentFilter(USB_PERMISSION);
            filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
            if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            else activity.registerReceiver(usbReceiver, filter);
        }

        @JavascriptInterface public void connect(int requestedBaudRate) {
            baudRate = requestedBaudRate;
            UsbDevice selected = selectDevice();
            if (selected == null) { callback("_error", "No compatible FlightCode USB device found"); return; }
            if (manager.hasPermission(selected)) open(selected);
            else {
                PendingIntent permission = PendingIntent.getBroadcast(activity, 0, new Intent(USB_PERMISSION).setPackage(activity.getPackageName()), PendingIntent.FLAG_IMMUTABLE);
                manager.requestPermission(selected, permission);
            }
        }

        @JavascriptInterface public boolean write(String base64) {
            UsbDeviceConnection active = connection;
            UsbEndpoint endpoint = output;
            if (active == null || endpoint == null) return false;
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            return active.bulkTransfer(endpoint, bytes, bytes.length, 1000) == bytes.length;
        }

        @JavascriptInterface public void disconnect() { close(true); }
        @JavascriptInterface public int vendorId() { return device == null ? 0 : device.getVendorId(); }
        @JavascriptInterface public int productId() { return device == null ? 0 : device.getProductId(); }

        private UsbDevice selectDevice() {
            for (UsbDevice candidate : manager.getDeviceList().values()) {
                int vendor = candidate.getVendorId(), product = candidate.getProductId();
                if ((vendor == 0x0483 && product == 0x5740) || (vendor == 0x2e8a && (product == 0x0009 || product == 0x000a))) return candidate;
            }
            return null;
        }

        private void open(UsbDevice selected) {
            io.execute(() -> {
                try {
                    close(false);
                    UsbInterface control = null, data = null;
                    for (int index = 0; index < selected.getInterfaceCount(); index++) {
                        UsbInterface candidate = selected.getInterface(index);
                        if (candidate.getInterfaceClass() == UsbConstants.USB_CLASS_COMM) control = candidate;
                        if (candidate.getInterfaceClass() == UsbConstants.USB_CLASS_CDC_DATA) data = candidate;
                    }
                    if (control == null || data == null) throw new IllegalStateException("The USB device has no CDC serial interface");
                    UsbEndpoint in = null, out = null;
                    for (int index = 0; index < data.getEndpointCount(); index++) {
                        UsbEndpoint endpoint = data.getEndpoint(index);
                        if (endpoint.getType() != UsbConstants.USB_ENDPOINT_XFER_BULK) continue;
                        if (endpoint.getDirection() == UsbConstants.USB_DIR_IN) in = endpoint; else out = endpoint;
                    }
                    if (in == null || out == null) throw new IllegalStateException("The USB device has no CDC data endpoints");
                    UsbDeviceConnection opened = manager.openDevice(selected);
                    if (opened == null || !opened.claimInterface(control, true) || !opened.claimInterface(data, true)) throw new IllegalStateException("Could not claim the USB serial interface");
                    byte[] coding = new byte[] {(byte)baudRate,(byte)(baudRate >> 8),(byte)(baudRate >> 16),(byte)(baudRate >> 24),0,0,8};
                    opened.controlTransfer(0x21, 0x20, 0, control.getId(), coding, coding.length, 1000);
                    opened.controlTransfer(0x21, 0x22, 1, control.getId(), null, 0, 1000);
                    device = selected; connection = opened; controlInterface = control; dataInterface = data; input = in; output = out; reading = true;
                    callback("_connected", null);
                    readLoop();
                } catch (Exception error) { close(false); callback("_error", error.getMessage()); }
            });
        }

        private void readLoop() {
            byte[] buffer = new byte[512];
            while (reading && connection != null) {
                int count = connection.bulkTransfer(input, buffer, buffer.length, 250);
                if (count > 0) callback("_data", Base64.encodeToString(Arrays.copyOf(buffer, count), Base64.NO_WRAP));
            }
        }

        private synchronized void close(boolean notify) {
            reading = false;
            if (connection != null) {
                try { if (dataInterface != null) connection.releaseInterface(dataInterface); } catch (Exception ignored) {}
                try { if (controlInterface != null) connection.releaseInterface(controlInterface); } catch (Exception ignored) {}
                connection.close();
            }
            connection = null; controlInterface = null; dataInterface = null; input = null; output = null; device = null;
            if (notify) callback("_disconnected", null);
        }

        private void callback(String method, String value) {
            String argument = value == null ? "" : JSONObject.quote(value);
            activity.runOnUiThread(() -> webView.evaluateJavascript("window.FlightCodeAndroidUsb&&window.FlightCodeAndroidUsb." + method + "(" + argument + ")", null));
        }

        void shutdown() {
            close(false);
            io.shutdownNow();
            try { activity.unregisterReceiver(usbReceiver); } catch (Exception ignored) {}
        }
    }
}
