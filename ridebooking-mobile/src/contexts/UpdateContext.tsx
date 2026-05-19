import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform, Alert, ToastAndroid } from 'react-native';
import * as Updates from 'expo-updates';

interface UpdateCtx {
  updateAvailable: boolean;
  isDownloading: boolean;
  isChecking: boolean;
  progress: number;
  updateReady: boolean;
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  applyUpdate: () => void;
}

const UpdateContext = createContext<UpdateCtx>({
  updateAvailable: false,
  isDownloading: false,
  isChecking: false,
  progress: 0,
  updateReady: false,
  checkForUpdate: async () => {},
  downloadUpdate: async () => {},
  applyUpdate: () => {},
});

const isNative = Platform.OS !== 'web';

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updateReady, setUpdateReady] = useState(false);

  // Silent scan — runs automatically on app open
  const silentCheck = async () => {
    if (!isNative) return;
    try {
      const { isAvailable } = await Updates.checkForUpdateAsync();
      if (isAvailable) setUpdateAvailable(true);
    } catch (_) {}
  };

  useEffect(() => {
    if (!isNative) return;
    const timer = setTimeout(silentCheck, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Manual check — called from "Check for Updates" button
  const checkForUpdate = async () => {
    if (!isNative) return;
    setIsChecking(true);
    try {
      const { isAvailable } = await Updates.checkForUpdateAsync();
      if (isAvailable) {
        setUpdateAvailable(true);
      } else {
        ToastAndroid.show('System is up to date', ToastAndroid.SHORT);
      }
    } catch (e) {
      Alert.alert('Check Error', String(e));
    } finally {
      setIsChecking(false);
    }
  };

  const downloadUpdate = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setProgress(0);
    let p = 0;
    const interval = setInterval(() => {
      p = Math.min(p + Math.random() * 18 + 4, 88);
      setProgress(Math.round(p));
    }, 350);
    try {
      await Updates.fetchUpdateAsync();
      clearInterval(interval);
      setProgress(100);
      setUpdateAvailable(false);
      setUpdateReady(true);
    } catch (e) {
      clearInterval(interval);
      setProgress(0);
      Alert.alert('Download Failed', String(e));
    } finally {
      setIsDownloading(false);
    }
  };

  const applyUpdate = () => {
    Updates.reloadAsync().catch(() => {
      Alert.alert('Restart Required', 'Please close and reopen the app to apply the update.');
    });
  };

  return (
    <UpdateContext.Provider value={{ updateAvailable, isDownloading, isChecking, progress, updateReady, checkForUpdate, downloadUpdate, applyUpdate }}>
      {children}
    </UpdateContext.Provider>
  );
}

export const useUpdate = () => useContext(UpdateContext);
