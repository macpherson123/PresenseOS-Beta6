/**
 * withDefaultApps.js — Expo config plugin
 *
 * Handles ALL requirements for PresenceOS to be set as default:
 *   HOME     → MAIN + CATEGORY_HOME + CATEGORY_DEFAULT
 *   BROWSER  → VIEW + http/https + BROWSABLE
 *   DIALER   → DIAL (with AND without scheme) + CALL + ANSWER + voicemail
 *   SMS      → SENDTO (smsto) + RESPOND_VIA_MESSAGE Service
 *              + SMS_DELIVER Receiver + WAP_PUSH_DELIVER Receiver
 *
 * Also generates required Java stub classes during prebuild so the
 * manifest references resolve. No manual file copying needed.
 */

const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RESPOND_VIA_MESSAGE_SERVICE = `package com.presenceoslite;
import android.app.IntentService;
import android.content.Intent;
import android.util.Log;
public class PresenceRespondViaMessageService extends IntentService {
    public PresenceRespondViaMessageService() { super("PresenceRespondViaMessageService"); }
    @Override protected void onHandleIntent(Intent intent) { Log.i("PresenceRVM", "RESPOND_VIA_MESSAGE received"); }
}`;

const SMS_RECEIVER = `package com.presenceoslite;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
public class PresenceSmsReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) { Log.i("PresenceSMS", "SMS_DELIVER received"); }
}`;

const MMS_RECEIVER = `package com.presenceoslite;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
public class PresenceMmsReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) { Log.i("PresenceMMS", "WAP_PUSH_DELIVER received"); }
}`;

function writeJavaStubs(config) {
  return withDangerousMod(config, ['android', async (config) => {
    const javaDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', 'com', 'presenceoslite');
    fs.mkdirSync(javaDir, { recursive: true });
    for (const [fn, src] of [
      ['PresenceRespondViaMessageService.java', RESPOND_VIA_MESSAGE_SERVICE],
      ['PresenceSmsReceiver.java', SMS_RECEIVER],
      ['PresenceMmsReceiver.java', MMS_RECEIVER],
    ]) {
      fs.writeFileSync(path.join(javaDir, fn), src, 'utf8');
      console.log('[withDefaultApps] Generated ' + fn);
    }
    return config;
  }]);
}

function modifyManifest(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];
    if (!app.activity) app.activity = [];
    if (!app.receiver) app.receiver = [];
    if (!app.service) app.service = [];

    const mainActivity = app.activity.find(a =>
      (a['intent-filter'] || []).some(f =>
        (f?.category || []).some(c => c?.$?.['android:name'] === 'android.intent.category.LAUNCHER')
      )
    );
    if (!mainActivity) { console.warn('[withDefaultApps] MainActivity not found'); return config; }

    const filters = mainActivity['intent-filter'] = mainActivity['intent-filter'] || [];
    const hasAction = (n) => filters.some(f => (f?.action||[]).some(a => a?.$?.['android:name']===n));
    const hasScheme = (act,sch) => filters.some(f =>
      (f?.action||[]).some(a => a?.$?.['android:name']===act) &&
      (f?.data||[]).some(d => d?.$?.['android:scheme']===sch));
    const hasCat = (act,cat) => filters.some(f =>
      (f?.action||[]).some(a => a?.$?.['android:name']===act) &&
      (f?.category||[]).some(c => c?.$?.['android:name']===cat));

    // HOME
    if (!hasCat('android.intent.action.MAIN','android.intent.category.HOME')) {
      const mf = filters.find(f => (f?.action||[]).some(a => a?.$?.['android:name']==='android.intent.action.MAIN'));
      if (mf) {
        if (!mf.category) mf.category = [];
        const cs = mf.category.map(c => c?.$?.['android:name']);
        if (!cs.includes('android.intent.category.HOME')) mf.category.push({$:{'android:name':'android.intent.category.HOME'}});
        if (!cs.includes('android.intent.category.DEFAULT')) mf.category.push({$:{'android:name':'android.intent.category.DEFAULT'}});
      }
    }

    // BROWSER
    if (!hasScheme('android.intent.action.VIEW','http')) {
      filters.push({
        action:[{$:{'android:name':'android.intent.action.VIEW'}}],
        category:[{$:{'android:name':'android.intent.category.DEFAULT'}},{$:{'android:name':'android.intent.category.BROWSABLE'}}],
        data:[{$:{'android:scheme':'http'}},{$:{'android:scheme':'https'}}],
      });
    }

    // DIALER — DIAL with tel scheme
    if (!hasScheme('android.intent.action.DIAL','tel')) {
      filters.push({
        action:[{$:{'android:name':'android.intent.action.DIAL'}}],
        category:[{$:{'android:name':'android.intent.category.DEFAULT'}},{$:{'android:name':'android.intent.category.BROWSABLE'}}],
        data:[{$:{'android:scheme':'tel'}}],
      });
    }

    // DIALER — DIAL bare (no scheme) — REQUIRED by Android for DIALER role
    if (!filters.some(f => (f?.action||[]).some(a => a?.$?.['android:name']==='android.intent.action.DIAL') && !(f?.data||[]).length)) {
      filters.push({
        action:[{$:{'android:name':'android.intent.action.DIAL'}}],
        category:[{$:{'android:name':'android.intent.category.DEFAULT'}}],
      });
    }

    // DIALER — CALL
    if (!hasAction('android.intent.action.CALL')) {
      filters.push({
        action:[{$:{'android:name':'android.intent.action.CALL'}}],
        category:[{$:{'android:name':'android.intent.category.DEFAULT'}}],
        data:[{$:{'android:scheme':'tel'}}],
      });
    }

    // DIALER — ANSWER
    if (!hasAction('android.intent.action.ANSWER')) {
      filters.push({
        action:[{$:{'android:name':'android.intent.action.ANSWER'}}],
        category:[{$:{'android:name':'android.intent.category.DEFAULT'}}],
      });
    }

    // DIALER — voicemail
    if (!hasScheme('android.intent.action.VIEW','voicemail')) {
      filters.push({
        action:[{$:{'android:name':'android.intent.action.VIEW'}}],
        category:[{$:{'android:name':'android.intent.category.DEFAULT'}},{$:{'android:name':'android.intent.category.BROWSABLE'}}],
        data:[{$:{'android:scheme':'voicemail'}}],
      });
    }

    // SMS — SENDTO
    if (!hasScheme('android.intent.action.SENDTO','smsto')) {
      filters.push({
        action:[{$:{'android:name':'android.intent.action.SENDTO'}}],
        category:[{$:{'android:name':'android.intent.category.DEFAULT'}}],
        data:[{$:{'android:scheme':'sms'}},{$:{'android:scheme':'smsto'}},{$:{'android:scheme':'mms'}},{$:{'android:scheme':'mmsto'}}],
      });
    }

    // SMS — RESPOND_VIA_MESSAGE as Service (NOT activity)
    app.service = app.service.filter(s => !(s.$?.['android:name']??'').includes('PresenceRespondViaMessage'));
    app.service.push({
      $:{'android:name':'.PresenceRespondViaMessageService','android:exported':'true','android:permission':'android.permission.SEND_RESPOND_VIA_MESSAGE'},
      'intent-filter':[{
        action:[{$:{'android:name':'android.intent.action.RESPOND_VIA_MESSAGE'}}],
        category:[{$:{'android:name':'android.intent.category.DEFAULT'}}],
        data:[{$:{'android:scheme':'sms'}},{$:{'android:scheme':'smsto'}},{$:{'android:scheme':'mms'}},{$:{'android:scheme':'mmsto'}}],
      }],
    });

    // SMS — Receivers
    app.receiver = app.receiver.filter(r => {
      const n = r.$?.['android:name']??'';
      return !n.includes('PresenceSmsReceiver') && !n.includes('PresenceMmsReceiver');
    });
    app.receiver.push(
      {$:{'android:name':'.PresenceSmsReceiver','android:exported':'true','android:permission':'android.permission.BROADCAST_SMS'},
       'intent-filter':[{$:{'android:priority':'999'},action:[{$:{'android:name':'android.provider.Telephony.SMS_DELIVER'}}]}]},
      {$:{'android:name':'.PresenceMmsReceiver','android:exported':'true','android:permission':'android.permission.BROADCAST_WAP_PUSH'},
       'intent-filter':[{$:{'android:priority':'999'},action:[{$:{'android:name':'android.provider.Telephony.WAP_PUSH_DELIVER'}}],
       data:[{$:{'android:mimeType':'application/vnd.wap.mms-message'}}]}]},
    );

    console.log('[withDefaultApps] Manifest: HOME + BROWSER + DIALER + SMS roles injected');
    return config;
  });
}

module.exports = function withDefaultApps(config) {
  config = writeJavaStubs(config);
  config = modifyManifest(config);
  return config;
};
