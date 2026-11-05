package com.rbabbit.blocknight.warzone;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Shader;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

/** Original upstream art, drawn proportionally with edge colours extended. */
final class WarzoneSplashView extends FrameLayout {
    private static Bitmap artwork, leftEdge, rightEdge;
    private final ImageView logo;
    private final TextView subtitle;
    WarzoneSplashView(Context context) {
        super(context);
        if(artwork==null){BitmapFactory.Options options=new BitmapFactory.Options();options.inScaled=false;artwork=BitmapFactory.decodeResource(getResources(),R.drawable.warzone_official_backdrop,options);leftEdge=edgeColours(false);rightEdge=edgeColours(true);}
        View scene=new View(context){
            private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
            private final BitmapShader leftFill=new BitmapShader(leftEdge,Shader.TileMode.CLAMP,Shader.TileMode.CLAMP),rightFill=new BitmapShader(rightEdge,Shader.TileMode.CLAMP,Shader.TileMode.CLAMP);
            @Override protected void onDraw(Canvas canvas){
                // Fit by height: a wide centre-crop cuts through pod or tracks.
                boolean stacked=getWidth()<dp(720)||getResources().getConfiguration().fontScale>1.15f;
                float scale=(getHeight()-dp(stacked?140:60))/(float)artwork.getHeight();Matrix transform=new Matrix();transform.setScale(scale,scale);
                float left=(getWidth()-artwork.getWidth()*scale)/2f,right=left+artwork.getWidth()*scale;
                transform.postTranslate(left,stacked?dp(18):0);
                // Average only the outermost source pixels, excluding the tank.
                // This extends the scene colours without sharp repeated stripes.
                Matrix background=new Matrix();background.setScale(1,artwork.getHeight()*scale/leftEdge.getHeight());background.postTranslate(0,stacked?dp(18):0);leftFill.setLocalMatrix(background);rightFill.setLocalMatrix(background);
                paint.setShader(leftFill);canvas.drawRect(0,0,getWidth()/2f,getHeight(),paint);paint.setShader(rightFill);canvas.drawRect(getWidth()/2f,0,getWidth(),getHeight(),paint);paint.setShader(null);
                int layer=canvas.saveLayer(left,0,right,getHeight(),null);
                canvas.drawBitmap(artwork,transform,paint);
                paint.setShader(new LinearGradient(left,0,right,0,new int[]{0x00FFFFFF,0xFFFFFFFF,0xFFFFFFFF,0x00FFFFFF},new float[]{0,.06f,.94f,1},Shader.TileMode.CLAMP));
                paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));canvas.drawRect(left,0,right,getHeight(),paint);
                paint.setShader(null);paint.setXfermode(null);canvas.restoreToCount(layer);
            }
        };
        scene.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);addView(scene,new LayoutParams(-1,-1));
        logo=new ImageView(context);logo.setImageResource(R.drawable.warzone_official_logo);logo.setScaleType(ImageView.ScaleType.FIT_CENTER);logo.setContentDescription("Warzone 2100");
        addView(logo,new LayoutParams(1,1,Gravity.TOP|Gravity.CENTER_HORIZONTAL));
        subtitle=new TextView(context);subtitle.setText("TOWER GAMES");subtitle.setTextSize(12);subtitle.setTextColor(0xFFF0E8D3);subtitle.setLetterSpacing(.35f);subtitle.setGravity(Gravity.CENTER);subtitle.setIncludeFontPadding(false);
        addView(subtitle,new LayoutParams(-2,-2,Gravity.TOP|Gravity.CENTER_HORIZONTAL));
    }
    private static Bitmap edgeColours(boolean right){
        Bitmap strip=Bitmap.createBitmap(1,32,Bitmap.Config.ARGB_8888);
        for(int i=0;i<32;i++){long red=0,green=0,blue=0;int count=0,cy=Math.round(i*(artwork.getHeight()-1)/31f);
            for(int y=Math.max(0,cy-96);y<=Math.min(artwork.getHeight()-1,cy+96);y+=3)for(int x=0;x<8;x+=2){int c=artwork.getPixel(right?artwork.getWidth()-1-x:x,y);red+=(c>>16)&255;green+=(c>>8)&255;blue+=c&255;count++;}
            strip.setPixel(0,i,0xFF000000|((int)(red/count)<<16)|((int)(green/count)<<8)|(int)(blue/count));
        }return strip;
    }
    @Override protected void onMeasure(int width,int height){
        int h=MeasureSpec.getSize(height),logoHeight=Math.min(dp(132),Math.round(h*(h<dp(480)?.18f:.22f)));LayoutParams p=(LayoutParams)logo.getLayoutParams();
        p.height=logoHeight;p.width=Math.round(logoHeight*490f/226f);p.topMargin=dp(10);LayoutParams s=(LayoutParams)subtitle.getLayoutParams();s.topMargin=p.topMargin+logoHeight+dp(4);super.onMeasure(width,height);
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
}
