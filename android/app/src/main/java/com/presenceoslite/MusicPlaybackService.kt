package com.presenceoslite

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the presenceOS audio process alive while music
 * is playing, even when the user switches to another app or turns off the screen.
 *
 * Started by PresenceDeviceControlModule.startMusicForeground() and stopped by
 * stopMusicForeground().  The service is transparent to the user — only a
 * low-priority status bar notification is shown (required by Android).
 */
class MusicPlaybackService : Service() {

  companion object {
    const val CHANNEL_ID = "presence_music_playback"
    const val NOTIF_ID   = 9001
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title  = intent?.getStringExtra("title")  ?: "Now playing"
    val artist = intent?.getStringExtra("artist") ?: ""
    createChannel()
    startForeground(NOTIF_ID, buildNotification(title, artist))
    return START_STICKY
  }

  override fun onDestroy() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    super.onDestroy()
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val ch = NotificationChannel(
        CHANNEL_ID,
        "Music Playback",
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description  = "presenceOS music playback"
        setShowBadge(false)
        setSound(null, null)
      }
      (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
        .createNotificationChannel(ch)
    }
  }

  private fun buildNotification(title: String, artist: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pi = PendingIntent.getActivity(
      this, 0, launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(artist.ifBlank { "presenceOS" })
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentIntent(pi)
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }
}
