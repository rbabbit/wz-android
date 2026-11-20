package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import java.util.function.Consumer;

/** Touch stick for continuous screen-relative army movement. */
final class ArmySteeringPad extends View {
  private static final float CENTER_ZONE = .15f;
  private static final long REPEAT_MS = 140;
  private final Consumer<String> send;
  private final Runnable showSize;
  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Runnable repeat = this::sendAndRepeat;
  private final Runnable sizeHold = this::revealSize;
  private Shader bezel;
  private Shader thumbcap;
  private int pointer = -1;
  private boolean resizing;
  private float tiltX, tiltY;

  ArmySteeringPad(Context context, Consumer<String> send, Runnable showSize) {
    super(context);
    this.send = send;
    this.showSize = showSize;
    setContentDescription("Army steering. Hold in a direction to move selected combat units. Hold the centre to show the size control.");
  }

  @Override protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
    float radius = Math.min(width, height) * .49f;
    if (radius <= 0) return;
    bezel = new LinearGradient(0, -radius, 0, radius,
        new int[]{0xFF6B6B6B, 0xFF363636, 0xFF171717, 0xFF080808},
        new float[]{0f, .07f, .86f, 1f}, Shader.TileMode.CLAMP);
    thumbcap = new LinearGradient(0, -radius * .43f, 0, radius * .43f,
        0xFF474747, 0xFF292929, Shader.TileMode.CLAMP);
  }

  @Override protected void onDraw(Canvas canvas) {
    float radius = Math.min(getWidth(), getHeight()) * .49f;
    if (radius <= 0) return;
    canvas.save();
    canvas.translate(getWidth() * .5f, getHeight() * .5f);
    paint.setShader(bezel);
    canvas.drawRoundRect(-radius, -radius, radius, radius, radius * .46f, radius * .46f, paint);
    paint.setShader(null);
    float face = radius * .95f, corner = radius * .42f, inset = radius * .7f;
    paint.setColor(0xFF202020);
    canvas.drawRoundRect(-face, -face, face, face, corner, corner, paint);
    paint.setColor(0xFF101010);
    canvas.drawRoundRect(-inset, -inset, inset, inset, corner, corner, paint);

    int active = Math.hypot(tiltX, tiltY) > CENTER_ZONE
        ? Math.floorMod((int) Math.round(Math.atan2(tiltX, -tiltY) / (Math.PI * .5)), 4) : -1;
    for (int i = 0; i < 4; i++) {
      paint.setColor(i == active || i == 0 && active == -1 ? 0xFFF3F1EB : 0xFF898984);
      canvas.drawRect(-radius * .11f, -radius * .88f, radius * .11f, -radius * .82f, paint);
      canvas.rotate(90);
    }

    canvas.translate(tiltX * radius * .21f, tiltY * radius * .27f);
    canvas.rotate(22);
    float capX = radius * .77f, capY = radius * .43f, capCorner = radius * .36f;
    paint.setColor(0xFF080808);
    canvas.drawRoundRect(-capX, -capY + radius * .05f, capX, capY + radius * .05f, capCorner, capCorner, paint);
    paint.setColor(0xFF676767);
    canvas.drawRoundRect(-capX, -capY, capX, capY, capCorner, capCorner, paint);
    float edge = radius * .026f;
    paint.setShader(thumbcap);
    canvas.drawRoundRect(-capX + edge, -capY + edge, capX - edge, capY - edge, capCorner, capCorner, paint);
    paint.setShader(null);
    for (int groove = -1; groove <= 1; groove++) {
      float y = groove * radius * .195f;
      float end = radius * .39f, halfHeight = radius * .046f;
      paint.setColor(0xFF565656);
      canvas.drawRoundRect(-end, y - halfHeight + edge, end, y + halfHeight + edge, halfHeight, halfHeight, paint);
      paint.setColor(0xFF1D1D1D);
      canvas.drawRoundRect(-end, y - halfHeight, end, y + halfHeight, halfHeight, halfHeight, paint);
    }
    canvas.restore();
  }

  @Override public boolean onTouchEvent(MotionEvent event) {
    int action = event.getActionMasked();
    if (action == MotionEvent.ACTION_DOWN) {
      float radius = Math.min(getWidth(), getHeight()) * .5f;
      float dx = Math.abs(event.getX() - getWidth() * .5f);
      float dy = Math.abs(event.getY() - getHeight() * .5f);
      float corner = radius * .46f, straight = radius - corner;
      if (Math.hypot(Math.max(0f, dx - straight), Math.max(0f, dy - straight)) > corner) return false;
      pointer = event.getPointerId(0);
      getParent().requestDisallowInterceptTouchEvent(true);
      updateTilt(event, 0);
      if (Math.hypot(tiltX, tiltY) <= CENTER_ZONE) {
        postDelayed(sizeHold, ViewConfiguration.getLongPressTimeout());
      }
      sendAndRepeat();
      return true;
    }
    if (pointer < 0) return false;
    int index = event.findPointerIndex(pointer);
    if (index < 0 || action == MotionEvent.ACTION_CANCEL || action == MotionEvent.ACTION_UP ||
        action == MotionEvent.ACTION_POINTER_UP && event.getActionIndex() == index) {
      stop();
    } else if (action == MotionEvent.ACTION_MOVE && !resizing) {
      updateTilt(event, index);
      if (Math.hypot(tiltX, tiltY) > CENTER_ZONE) removeCallbacks(sizeHold);
    }
    return true;
  }

  private void updateTilt(MotionEvent event, int index) {
    float range = Math.min(getWidth(), getHeight()) * .34f;
    float x = (event.getX(index) - getWidth() * .5f) / range;
    float y = (event.getY(index) - getHeight() * .5f) / range;
    float magnitude = Math.max(1f, (float) Math.hypot(x, y));
    tiltX = x / magnitude;
    tiltY = y / magnitude;
    invalidate();
  }

  private void sendAndRepeat() {
    if (pointer < 0) return;
    send.accept("steer(" + tiltX + "," + tiltY + ")");
    postDelayed(repeat, REPEAT_MS);
  }

  private void revealSize() {
    if (pointer < 0) return;
    resizing = true;
    removeCallbacks(repeat);
    tiltX = tiltY = 0;
    send.accept("stopSteering()");
    invalidate();
    showSize.run();
  }

  void stop() {
    if (pointer < 0) return;
    pointer = -1;
    removeCallbacks(sizeHold);
    removeCallbacks(repeat);
    tiltX = tiltY = 0;
    if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(false);
    if (!resizing) send.accept("stopSteering()");
    resizing = false;
    invalidate();
  }

  @Override public void onWindowFocusChanged(boolean focused) {
    super.onWindowFocusChanged(focused);
    if (!focused) stop();
  }

  @Override protected void onDetachedFromWindow() {
    stop();
    super.onDetachedFromWindow();
  }
}
