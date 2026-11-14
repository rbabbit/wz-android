package com.rbabbit.blocknight.warzone;

import java.awt.Font;
import java.awt.font.FontRenderContext;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Host font/geometry checks execute the actual production layout helper. */
final class HomeLayoutCheck074 {
    private static final String[] LABELS = {"CAMPAIGN", "TOWERS", "FFA", "MULTIPLAYER", "GUIDE"};
    private static final FontRenderContext FRC = new FontRenderContext(null, true, true);
    private static Font face;
    private static int assertions;
    private static final List<String> scenarios = new ArrayList<>();

    private static void yes(boolean value, String reason) {
        assertions++; if (!value) throw new AssertionError(reason);
    }
    private static boolean intersects(HomeMenuLayout.Box a, HomeMenuLayout.Box b) {
        return a.left < b.right() && a.right() > b.left && a.top < b.bottom() && a.bottom() > b.top;
    }
    private static HomeMenuLayout.Result scenario(int widthDp, int heightDp, float density,
            float fontScale, int[] insetDp, boolean error) {
        int width = Math.round(widthDp * density), height = Math.round(heightDp * density);
        int[] labelWidths = new int[5]; int fontHeight = 0;
        for (int i = 0; i < LABELS.length; i++) {
            Font font = face.deriveFont((i == 4 ? 14 : 16) * density * fontScale);
            labelWidths[i] = (int) Math.ceil(font.getStringBounds(LABELS[i], FRC).getWidth());
            fontHeight = Math.max(fontHeight, (int) Math.ceil(font.getLineMetrics(LABELS[i], FRC).getHeight()));
        }
        int[] insets = java.util.Arrays.stream(insetDp).map(n -> Math.round(n * density)).toArray();
        int footerHeight = (int) Math.ceil(face.deriveFont((error ? 24 : 10) * density * fontScale).getLineMetrics("rbabbit v0.74", FRC).getHeight());
        HomeMenuLayout.Result r = HomeMenuLayout.measure(width, height, density, insets[0], insets[1],
                insets[2], insets[3], labelWidths, fontHeight, footerHeight);
        String label = widthDp + "x" + heightDp + " density=" + density + " font=" + fontScale + " cutout=" + java.util.Arrays.toString(insetDp) + " error=" + error;
        yes(r.buttons.length == 5, label + " lost a mode");
        for (int i = 0; i < r.buttons.length; i++) {
            HomeMenuLayout.Box button = r.buttons[i];
            yes(button.width >= Math.round(48 * density) && button.height >= Math.round(48 * density), label + " undersized touch target " + LABELS[i]);
            yes(button.width >= labelWidths[i] + Math.round(20 * density), label + " measured label does not fit " + LABELS[i]);
            yes(button.height - Math.round(16 * density) >= fontHeight, label + " scaled font does not fit visible face");
            yes(button.left >= r.contentLeft && button.right() <= r.contentRight, label + " clipped button " + LABELS[i]);
            yes(button.top >= insets[1] && button.bottom() + Math.round(8 * density) <= r.footerBottom - footerHeight, label + " button covers footer");
            for (int j = 0; j < i; j++) yes(!intersects(button, r.buttons[j]), label + " overlapping touch targets");
            yes(!intersects(button, r.logo) && !intersects(button, r.tank), label + " artwork covers a control");
        }
        for (HomeMenuLayout.Box art : new HomeMenuLayout.Box[]{r.logo, r.tank}) {
            yes(art.width > 0 && art.height > 0, label + " artwork disappeared");
            yes(art.left >= r.contentLeft && art.right() <= r.contentRight && art.top >= insets[1], label + " clipped artwork");
        }
        yes(!intersects(r.logo, r.tank), label + " logo/tank overlap");
        yes(Math.abs(r.logo.width - r.logo.height * 483f / 228f) <= 2.2, label + " logo aspect changed");
        yes(Math.abs(r.tank.width - r.tank.height * 1619f / 971f) <= 2.2, label + " tank aspect changed");
        yes(r.logo.right() < r.tank.left, label + " approved left/right arrangement changed");
        if (widthDp >= 600 && fontScale <= 1.3f) yes(r.rows == 1, label + " wrapped unnecessarily");
        scenarios.add(label + " rows=" + r.rows);
        return r;
    }

    public static void main(String[] args) throws Exception {
        face = Font.createFont(Font.TRUETYPE_FONT, new File(args[0]));
        for (int[] size : new int[][]{{800,360},{640,320},{600,300},{1200,540}})
            for (float density : new float[]{1,2,3}) for (float scale : new float[]{1,1.3f}) {
                scenario(size[0],size[1],density,scale,new int[]{0,0,0,0},false);
                scenario(size[0],size[1],density,scale,new int[]{32,0,12,16},false);
            }
        for (int[] size : new int[][]{{800,360},{640,320},{600,300}})
            scenario(size[0],size[1],2,1.3f,new int[]{32,12,12,16},true);
        HomeMenuLayout.Result compact = scenario(400,300,1,1.8f,new int[]{0,0,0,0},false);
        yes(compact.rows == 2, "Extra-large narrow fixture must wrap instead of shrinking text");
        HomeMenuLayout.Result normal = scenario(800,360,1,1,new int[]{0,0,0,0},false);
        yes(Math.abs(normal.logo.left - 86) <= 2, "Approved Home3 logo position");
        yes(Math.abs(normal.tank.left - 409) <= 2, "Approved Home3 tank position");
        yes(normal.buttons[0].top >= 265 && normal.buttons[0].top <= 280, "Approved lower single-row placement");
        HomeMenuLayout.Result again = scenario(800,360,1,1,new int[]{0,0,0,0},false);
        yes(normal.buttons[3].width == again.buttons[3].width, "Font-size changes must not accumulate shrinkage");
        StringBuilder json = new StringBuilder("{\"passed\":true,\"assertions\":" + assertions + ",\"scenarios\":[");
        for (int i = 0; i < scenarios.size(); i++) {
            if (i > 0) json.append(','); json.append('"').append(scenarios.get(i)).append('"');
        }
        json.append("]}"); Files.writeString(Path.of(args[1]), json); System.out.println(json);
    }
}
