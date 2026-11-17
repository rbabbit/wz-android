package com.rbabbit.blocknight.warzone;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Grants the Android installer read access to exactly one app-private verified APK. */
public final class AppUpdateProvider extends ContentProvider {
    static File apkFile(Context context) {
        return new File(new File(context.getFilesDir(), "updates"), AppUpdatePolicy.APK_NAME);
    }
    static Uri apkUri(Context context) {
        return new Uri.Builder().scheme("content").authority(context.getPackageName() + ".updates")
                .appendPath(AppUpdatePolicy.APK_NAME).build();
    }
    private boolean valid(Uri uri) { return getContext() != null && apkUri(getContext()).equals(uri); }
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) {
        if (!valid(uri)) throw new IllegalArgumentException("Unknown update file");
        return "application/vnd.android.package-archive";
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!valid(uri) || !"r".equals(mode)) throw new FileNotFoundException("Read-only update file");
        return ParcelFileDescriptor.open(apkFile(getContext()), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection,
            String[] selectionArgs, String sortOrder) {
        if (!valid(uri)) throw new IllegalArgumentException("Unknown update file");
        String[] columns = projection == null
                ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        MatrixCursor result = new MatrixCursor(columns, 1);
        Object[] values = new Object[columns.length];
        for (int i = 0; i < columns.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) values[i] = AppUpdatePolicy.APK_NAME;
            else if (OpenableColumns.SIZE.equals(columns[i])) values[i] = apkFile(getContext()).length();
        }
        result.addRow(values);
        return result;
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) {
        throw new UnsupportedOperationException();
    }
}
