package com.rbabbit.blocknight.warzone;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/** Inert platform edges; methods under test are injected verbatim from HubView. */
final class HubNativeCheck075 {
    private static int assertions;
    private static void yes(boolean value, String reason) { assertions++; if (!value) throw new AssertionError(reason); }
    private static final class Uri {
        final URI value;
        Uri(String value) { this.value=URI.create(value); }
        String getScheme(){return value.getScheme();} String getHost(){return value.getHost();}
        int getPort(){return value.getPort();} String getUserInfo(){return value.getUserInfo();}
        String getPath(){return value.getPath();} String getQuery(){return value.getQuery();}
        String getEncodedQuery(){return value.getRawQuery();} String getFragment(){return value.getFragment();}
    }
    private static final class Policy {
        private static final String APP_HOST="appassets.androidplatform.net", DATA_HOST="warzone2100.retropaganda.info";
        /*PRODUCTION_POLICY*/
    }
    private static final class Browser {
        int paused, resumed, destroyed, stopped;
        final List<String> scripts=new ArrayList<>();
        final List<Consumer<String>> callbacks=new ArrayList<>();
        void evaluateJavascript(String script, Consumer<String> callback) { scripts.add(script); if(callback!=null)callbacks.add(callback); }
        void onPause(){paused++;} void onResume(){resumed++;} void stopLoading(){stopped++;} void destroy(){destroyed++;}
        void answer(int index,String answer){callbacks.get(index).accept(answer);}
    }
    private static final class Life {
        final Browser browser=new Browser();
        final List<Runnable> posted=new ArrayList<>();
        int closed, keyboardHides, removed;
        final Runnable close=()->closed++;
        boolean disposed, paused, backPending, keyboard;
        int backGeneration;
        Runnable backTimeout;
        boolean keyboardVisible(){return keyboard;}
        void hideKeyboard(){keyboardHides++;keyboard=false;}
        void postDelayed(Runnable runnable,int delay){yes(delay==1000,"bounded busy-page Back timeout");posted.add(runnable);}
        void removeCallbacks(Runnable runnable){posted.remove(runnable);}
        void removeView(Browser ignored){removed++;}
        /*PRODUCTION_LIFECYCLE*/
    }
    private static void policies() {
        String app="https://appassets.androidplatform.net/assets/", data="https://warzone2100.retropaganda.info";
        String[] assets={"hub/index.html","hub/hub.css","hub/hub.js","hub/hub-worker.js","hub/hub-data.js","warzone/ui/Oswald.ttf"};
        for(String asset:assets)yes(Policy.localAsset(new Uri(app+asset)),"expected bundled asset "+asset);
        for(String asset:new String[]{"hub/../index.html","hub/%2e%2e/index.html","hub/extra.js","warzone/index.html","multiplayer/engine.html","warzone/warzone2100.js","warzone/music.opus","../../private/preferences.xml"})
            yes(!Policy.localAsset(new Uri(app+asset)),"forbidden asset "+asset);
        for(String url:new String[]{"http://appassets.androidplatform.net/assets/hub/index.html","file:///assets/hub/index.html","https://evil.test/assets/hub/index.html","https://appassets.androidplatform.net.evil.test/assets/hub/index.html","https://appassets.androidplatform.net@evil.test/assets/hub/index.html","https://evil@appassets.androidplatform.net/assets/hub/index.html","https://appassets.androidplatform.net:444/assets/hub/index.html"})
            yes(!Policy.localAsset(new Uri(url)),"asset origin rejected "+url);
        yes(Policy.localDocument(new Uri(app+"hub/index.html")),"only local document allowed");
        for(String asset:assets)if(!asset.equals("hub/index.html"))yes(!Policy.localDocument(new Uri(app+asset)),"not navigable asset "+asset);
        String[] feeds={"/results.json","/results.json?id=","/results.json?id=11_6_7701_1794665123095","/results.json?id="+"1".repeat(100),"/player-public-keys.json","/player-spoiled-public-keys.json"};
        for(String feed:feeds){yes(Policy.publicData(new Uri(data+feed),"GET"),"allowed GET "+feed);for(String verb:new String[]{"POST","PUT","DELETE","HEAD","OPTIONS","get"})yes(!Policy.publicData(new Uri(data+feed),verb),"denied method "+verb);}
        for(String path:new String[]{"/results.json?id=-1","/results.json?id=abc","/results.json?id=1&foo=2","/results.json?id=1&id=2","/results.json?id=%31","/results.json?id="+"1".repeat(101),"/results.json?","/player-public-keys.json?id=1","/player-spoiled-public-keys.json?","/results.json#fragment","/hub","/replays/1794660985125.wzrp","/anything.js","/results.json/extra"})
            yes(!Policy.publicData(new Uri(data+path),"GET"),"denied feed "+path);
        for(String origin:new String[]{"http://warzone2100.retropaganda.info","https://evil.test","https://warzone2100.retropaganda.info.evil.test","https://evil@warzone2100.retropaganda.info","https://warzone2100.retropaganda.info:444"})
            yes(!Policy.publicData(new Uri(origin+"/results.json?id="),"GET"),"denied data origin "+origin);
        yes(Policy.dataDestination(Map.of()),"older WebView may omit destination header");
        yes(Policy.dataDestination(Map.of("sec-fetch-dest","empty")),"fetch destination accepted");
        for(String dest:new String[]{"script","style","worker","document","iframe","image","font"})yes(!Policy.dataDestination(Map.of("Sec-Fetch-Dest",dest)),"not fetch "+dest);
        yes(Policy.sourceLink(new Uri(data+"/hub"))&&Policy.sourceLink(new Uri(data+"/hub/")),"source attribution external allowlist");
        for(String path:new String[]{"/hub?x=1","/hub#x","/hub/other","/results.json","/replays/1794660985125.wzrp"})yes(!Policy.sourceLink(new Uri(data+path)),"unapproved external URL "+path);
    }
    private static void lifecycle() {
        Life keyboard=new Life();keyboard.keyboard=true;keyboard.back();
        yes(keyboard.keyboardHides==1&&keyboard.closed==0&&!keyboard.backPending,"Back first dismisses keyboard");
        Life detail=new Life();detail.back();detail.back();
        yes(detail.browser.callbacks.size()==1&&detail.posted.size()==1,"duplicate Back cannot queue stale dialogs");
        detail.browser.answer(0,"\"handled\"");yes(detail.closed==0&&!detail.backPending&&detail.posted.isEmpty(),"detail Back stays in reader");
        detail.back();detail.browser.answer(1,"\"close\"");yes(detail.closed==1,"root Back returns home");
        Life focused=new Life();focused.back();focused.browser.answer(0,"\"keyboard\"");
        yes(focused.keyboardHides==1&&focused.closed==0,"focused search blur is not root navigation");
        Life busy=new Life();busy.back();Runnable timeout=busy.posted.get(0);timeout.run();yes(busy.closed==1,"busy page cannot trap native Back");
        Life paused=new Life();paused.back();Runnable oldTimeout=paused.posted.get(0);paused.pause();
        paused.browser.answer(0,"\"close\"");oldTimeout.run();yes(paused.closed==0&&!paused.backPending,"pause invalidates old Back callbacks and timeout");
        yes(paused.browser.paused==1&&paused.browser.scripts.get(1).contains("warzone-hub-pause"),"pause notifies reader before native pause");
        paused.resume();yes(paused.browser.resumed==1&&paused.browser.scripts.get(2).contains("warzone-hub-resume"),"resume restarts reader lifecycle");
        Life closing=new Life();closing.back();Runnable retired=closing.posted.get(0);closing.dispose();closing.dispose();closing.browser.answer(0,"\"close\"");retired.run();closing.back();closing.resume();closing.pause();
        yes(closing.closed==0&&closing.browser.callbacks.size()==1&&closing.posted.isEmpty(),"disposed view never closes a subsequent home/reader");
        yes(closing.browser.destroyed==1&&closing.browser.stopped==1&&closing.removed==1,"idempotent hard cleanup destroys worker realm/network");
        yes(closing.browser.scripts.get(1).contains("dispose"),"JS cleanup requested before native destroy");
    }
    public static void main(String[] args){policies();lifecycle();System.out.println("{\"policiesPassed\":true,\"lifecyclePassed\":true,\"assertions\":"+assertions+"}");}
}
