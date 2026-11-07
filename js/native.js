/* ==========================================================================
   NoteFlow — native.js
   Optional Capacitor bindings for Android. Safe no-op fallbacks on web.
   ========================================================================== */
(function (NoteFlow) {
  'use strict';

  function firstDefined() {
    for (let i = 0; i < arguments.length; i += 1) {
      if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
    }
    return undefined;
  }

  const CapacitorGlobal = window.Capacitor || {};
  const plugins = CapacitorGlobal.Plugins || {};
  const App = firstDefined(window.capacitorApp && window.capacitorApp.App, plugins.App);
  const Haptics = firstDefined(window.capacitorHaptics && window.capacitorHaptics.Haptics, plugins.Haptics);
  const HapticsConstants = window.capacitorHaptics || {};
  const Share = firstDefined(window.capacitorShare && window.capacitorShare.Share, plugins.Share);
  const StatusBar = firstDefined(window.capacitorStatusBar && window.capacitorStatusBar.StatusBar, plugins.StatusBar);
  const StatusBarConstants = window.capacitorStatusBar || {};
  const Filesystem = firstDefined(plugins.Filesystem, plugins.FilesystemPlugin);
  const FilesystemConstants = window.capacitorFilesystemPluginCapacitor || {};

  const isNative = Boolean(
    (typeof CapacitorGlobal.isNativePlatform === 'function' && CapacitorGlobal.isNativePlatform()) ||
      CapacitorGlobal.getPlatform?.() === 'android' ||
      CapacitorGlobal.getPlatform?.() === 'ios' ||
      navigator.userAgent.includes('wv')
  );

  async function ignoreErrors(promise) {
    try {
      return await promise;
    } catch (error) {
      return null;
    }
  }

  async function haptic(kind) {
    if (!isNative) return false;

    const style =
      (HapticsConstants.ImpactStyle && HapticsConstants.ImpactStyle.Light) || 'LIGHT';
    const medium =
      (HapticsConstants.ImpactStyle && HapticsConstants.ImpactStyle.Medium) || 'MEDIUM';
    const success =
      (HapticsConstants.NotificationType && HapticsConstants.NotificationType.Success) || 'SUCCESS';

    if (Haptics) {
      if (kind === 'success' && typeof Haptics.notification === 'function') {
        await ignoreErrors(Haptics.notification({ type: success }));
        return true;
      }
      if (typeof Haptics.impact === 'function') {
        await ignoreErrors(Haptics.impact({ style: kind === 'medium' ? medium : style }));
        return true;
      }
      if (typeof Haptics.selectionChanged === 'function') {
        await ignoreErrors(Haptics.selectionChanged());
        return true;
      }
    }

    if (navigator.vibrate) {
      navigator.vibrate(kind === 'success' ? [12, 35, 12] : 12);
      return true;
    }
    return false;
  }

  async function shareText(options) {
    const title = options && options.title ? String(options.title) : 'NoteFlow note';
    const text = options && options.text ? String(options.text) : '';
    const dialogTitle = options && options.dialogTitle ? String(options.dialogTitle) : 'Share note';

    if (!isNative && navigator.share) {
      try {
        await navigator.share({ title, text });
        return true;
      } catch (error) {
        return false;
      }
    }

    if (Share && typeof Share.share === 'function') {
      try {
        await Share.share({ title, text, dialogTitle });
        return true;
      } catch (error) {
        return false;
      }
    }

    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return true;
      } catch (error) {
        return false;
      }
    }

    return false;
  }

  async function writeTextFile(filename, text) {
    if (!isNative || !Filesystem || typeof Filesystem.writeFile !== 'function') return null;

    const Directory =
      FilesystemConstants.Directory ||
      { Documents: 'DOCUMENTS', Data: 'DATA', External: 'EXTERNAL', ExternalStorage: 'EXTERNAL_STORAGE' };
    const Encoding = FilesystemConstants.Encoding || { UTF8: 'utf8' };
    const safeFilename = String(filename || 'noteflow.txt').replace(/[\\/:*?"<>|]+/g, '-');

    const directories = [Directory.Documents, Directory.Data, Directory.ExternalStorage, Directory.External].filter(Boolean);
    for (const directory of directories) {
      try {
        const result = await Filesystem.writeFile({
          path: safeFilename,
          data: String(text || ''),
          directory,
          encoding: Encoding.UTF8,
          recursive: false,
        });
        return { uri: result && result.uri ? result.uri : undefined, directory, filename: safeFilename };
      } catch (error) {
        // Try the next app-private directory.
      }
    }
    return null;
  }

  async function shareFile(filename, text, title) {
    const written = await writeTextFile(filename, text);
    if (written && written.uri && Share && typeof Share.share === 'function') {
      try {
        await Share.share({
          title: title || filename,
          text: '',
          files: [written.uri],
          dialogTitle: 'Share file',
        });
        return true;
      } catch (error) {
        return false;
      }
    }

    if (written) return true;
    return shareText({ title: title || filename, text, dialogTitle: 'Share note' });
  }

  async function setStatusBarTheme(isDark) {
    if (!isNative || !StatusBar) return false;

    const Style = StatusBarConstants.Style || { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' };
    const color = isDark ? '#08070d' : '#f4f2fb';

    if (typeof StatusBar.setOverlaysWebView === 'function') {
      await ignoreErrors(StatusBar.setOverlaysWebView({ overlay: false }));
    }
    if (typeof StatusBar.setBackgroundColor === 'function') {
      await ignoreErrors(StatusBar.setBackgroundColor({ color }));
    }
    if (typeof StatusBar.setStyle === 'function') {
      await ignoreErrors(StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }));
    }
    if (typeof StatusBar.show === 'function') {
      await ignoreErrors(StatusBar.show({ animation: (StatusBarConstants.Animation && StatusBarConstants.Animation.None) || 'NONE' }));
    }
    return true;
  }

  let backListener = null;
  async function initBackButton(handler) {
    if (!isNative || !App || typeof App.addListener !== 'function' || typeof handler !== 'function') return false;
    if (backListener) return true;

    backListener = await ignoreErrors(
      App.addListener('backButton', async ({ canGoBack }) => {
        const handled = await handler({ canGoBack });
        if (!handled && App && typeof App.exitApp === 'function') {
          await ignoreErrors(App.exitApp());
        }
      })
    );
    return Boolean(backListener);
  }

  NoteFlow.NativeAndroid = {
    isNative,
    haptic,
    shareText,
    writeTextFile,
    shareFile,
    setStatusBarTheme,
    initBackButton,
  };
})(window.NoteFlow = window.NoteFlow || {});
