package ru.etalonpravilo.admin;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

/**
 * Шаблон MainActivity для Capacitor / Android Studio с подключением штатного BluetoothBridge.
 * Поместите рядом с BluetoothBridge.java в пакет приложения и обновите package при необходимости.
 */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if (this.bridge != null && this.bridge.getWebView() != null) {
      WebView webView = this.bridge.getWebView();
      webView.addJavascriptInterface(
          new BluetoothBridge(this, webView), "EtalonNativeBluetooth");
    }
  }
}
