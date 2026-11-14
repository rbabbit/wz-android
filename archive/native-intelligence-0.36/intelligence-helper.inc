// Towers-only completed-research metadata and genuine native PIE preview.
// This is inserted into hci.cpp so paused native menus can retire it too.
#ifdef __EMSCRIPTEN__
namespace {
using TowersIntelJson = nlohmann::json;
struct TowersIntelRetiredRect { int x, y, width, height; };
struct TowersIntelState
{
	std::string nonce;
	std::string topicId;
	bool open = false;
	bool rectValid = false;
	std::vector<TowersIntelRetiredRect> retiredRects;
	int x = 0, y = 0, width = 0, height = 0;
	UDWORD lastPoll = 0, lastActivity = 0, lastGameTime = 0;
	uint64_t frames = 0;
	bool initialCaptured = false, initialKnown = false;
	UDWORD initialPlayer = MAX_PLAYERS;
	std::unordered_set<std::string> initialIds;
	AUDIO_STREAM *stream = nullptr;
	TowersIntelJson reply;
	std::string closedReason;
};
static TowersIntelState towersIntel;

static void towersIntelRetireRect()
{
	if (towersIntel.rectValid) towersIntel.retiredRects.push_back({towersIntel.x,towersIntel.y,towersIntel.width,towersIntel.height});
	towersIntel.rectValid = false;
}

static void towersIntelClearRetiredRects()
{
	if (gameUpdatePaused()) for (const auto &rect : towersIntel.retiredRects)
		pie_BoxFill(rect.x,rect.y,rect.x+rect.width,rect.y+rect.height,WZCOL_BLACK);
	towersIntel.retiredRects.clear();
}

static bool towersIntelEnabled()
{
	FILE *file = fopen("/tmp/warzone-towers-ui-v34", "rb");
	if (!file) return false;
	const bool enabled = fgetc(file) == '1';
	fclose(file);
	return enabled;
}

static void towersIntelStopAudio()
{
	if (towersIntel.stream) sound_StopStream(towersIntel.stream);
	towersIntel.stream = nullptr;
}

static void towersIntelClose(const char *reason)
{
	towersIntelStopAudio();
	towersIntelRetireRect();
	towersIntel.open = false;
	towersIntel.rectValid = false;
	towersIntel.topicId.clear();
	towersIntel.closedReason = reason;
	if (towersIntel.reply.is_null() && !towersIntel.nonce.empty())
		towersIntel.reply = {{"nonce",towersIntel.nonce},{"ok",false},{"error",reason}};
}

static void towersIntelligenceReset()
{
	towersIntelStopAudio();
	towersIntel = TowersIntelState{};
	remove("/tmp/warzone-towers-intelligence-command.json");
	remove("/tmp/warzone-towers-intelligence-state.json");
}

static RESEARCH *towersIntelCompleted(const std::string &id)
{
	if (selectedPlayer >= MAX_PLAYERS || asPlayerResList[selectedPlayer].size() != asResearch.size()) return nullptr;
	RESEARCH *research = nullptr;
	for (auto &entry : asResearch) if (entry.id.toUtf8() == id) { research = &entry; break; }
	if (!research || research->index < 0 || size_t(research->index) >= asResearch.size()
	    || !IsResearchCompleted(&asPlayerResList[selectedPlayer][research->index])) return nullptr;
	return research;
}

static const char *towersIntelCategory(const RESEARCH &research)
{
	switch (research.iconID)
	{
	case IMAGE_RES_DROIDTECH: return "Vehicles";
	case IMAGE_RES_CYBORGTECH: return "Cyborgs";
	case IMAGE_RES_WEAPONTECH: return "Weapons";
	case IMAGE_RES_COMPUTERTECH: return "Computers";
	case IMAGE_RES_POWERTECH: return "Power";
	case IMAGE_RES_SYSTEMTECH: return "Systems";
	case IMAGE_RES_STRUCTURETECH: return "Structures";
	case IMAGE_RES_DEFENCE: return "Defences";
	default: return "Research";
	}
}

static const char *towersIntelAudio(const RESEARCH &research)
{
	// Same category mapping as W_INTELLIGENCEOVERLAY_FORM::intIntelButtonPressed.
	switch (research.iconID)
	{
	case IMAGE_RES_DROIDTECH:
	case IMAGE_RES_CYBORGTECH: return "sequenceaudio/res_droid.ogg";
	case IMAGE_RES_WEAPONTECH: return "sequenceaudio/res_weapons.ogg";
	case IMAGE_RES_COMPUTERTECH: return "sequenceaudio/res_com.ogg";
	case IMAGE_RES_POWERTECH: return "sequenceaudio/res_pow.ogg";
	case IMAGE_RES_SYSTEMTECH: return "sequenceaudio/res_systech.ogg";
	case IMAGE_RES_STRUCTURETECH:
	case IMAGE_RES_DEFENCE: return "sequenceaudio/res_strutech.ogg";
	default: return nullptr;
	}
}

static bool towersIntelModel(const RESEARCH &research, std::string &kind)
{
	kind.clear();
	if (!research.psStat)
	{
		if (research.pIMD && research.pIMD->displayModel()) { kind = "research"; return true; }
		return false;
	}
	if (StatIsStructure(research.psStat))
	{
		const auto *stat = static_cast<const STRUCTURE_STATS *>(research.psStat);
		if (!stat->pIMD.empty() && stat->pIMD[0] && stat->pIMD[0]->displayModel()) { kind = "structure"; return true; }
		return false;
	}
	const auto component = StatIsComponent(research.psStat);
	if (component == COMP_NUMCOMPONENTS) return false;
	const iIMDShape *shape = nullptr, *mount = nullptr;
	if (!StatGetComponentIMD(research.psStat, component, &shape, &mount) || !shape) return false;
	kind = "component";
	return true;
}

static TowersIntelJson towersIntelSummary(RESEARCH &research)
{
	bool hasMessage = false, read = true;
	for (const MESSAGE *message : apsMessages[selectedPlayer])
	{
		if (message->type == MSG_RESEARCH && message->pViewData && message->pViewData == research.pViewData)
		{
			hasMessage = true;
			read = read && message->read;
		}
	}
	std::string modelKind;
	const auto id = research.id.toUtf8();
	const char *audio = towersIntelAudio(research);
	TowersIntelJson initial = nullptr;
	if (towersIntel.initialKnown && towersIntel.initialPlayer == selectedPlayer) initial = towersIntel.initialIds.count(id) != 0;
	return {{"id",id},{"name",getLocalizedStatsName(&research)},{"iconId",research.iconID},
	        {"major",research.techCode == TC_MAJOR},
	        {"hasReport",research.pViewData && research.pViewData->type == VIEW_RES && !research.pViewData->textMsg.empty()},
	        {"hasMessage",hasMessage},{"read",hasMessage ? TowersIntelJson(read) : TowersIntelJson(nullptr)},
	        {"initialGrant",initial},{"hasModel",towersIntelModel(research,modelKind)},
	        {"modelKind",modelKind},{"category",towersIntelCategory(research)},
	        {"categoryAudio",audio ? TowersIntelJson(audio) : TowersIntelJson(nullptr)}};
}

static TowersIntelJson towersIntelDetails(RESEARCH &research)
{
	auto result = towersIntelSummary(research);
	result["description"] = TowersIntelJson::array();
	if (research.pViewData && research.pViewData->type == VIEW_RES)
	{
		for (const auto &paragraph : research.pViewData->textMsg) result["description"].push_back(paragraph.toUtf8());
	}
	result["results"] = research.results;
	result["unlocks"] = TowersIntelJson::array();
	for (auto index : research.pStructureResults)
	{
		if (asStructureStats && index < numStructureStats)
		{
			const auto &stat = asStructureStats[index];
			result["unlocks"].push_back({{"id",stat.id.toUtf8()},{"name",getLocalizedStatsName(&stat)},{"kind","structure"}});
		}
	}
	for (const auto *stat : research.componentResults)
	{
		if (stat) result["unlocks"].push_back({{"id",stat->id.toUtf8()},{"name",getLocalizedStatsName(stat)},{"kind","component"}});
	}
	result["replacements"] = TowersIntelJson::array();
	for (const auto &replacement : research.componentReplacement)
	{
		if (replacement.pOldComponent && replacement.pNewComponent)
			result["replacements"].push_back({{"oldId",replacement.pOldComponent->id.toUtf8()},
				{"oldName",getLocalizedStatsName(replacement.pOldComponent)},
				{"newId",replacement.pNewComponent->id.toUtf8()},
				{"newName",getLocalizedStatsName(replacement.pNewComponent)}});
	}
	return result;
}

static void towersIntelPlayReport(RESEARCH &research)
{
	towersIntelStopAudio();
	const char *audio = towersIntelAudio(research);
	if (!audio) return;
	towersIntel.stream = audio_PlayStream(audio,sound_GetUIVolume(),[](const AUDIO_STREAM *stream,const void *) {
		if (stream == towersIntel.stream) towersIntel.stream = nullptr;
	},nullptr);
}

static bool towersIntelRect(const TowersIntelJson &request)
{
	towersIntelRetireRect();
	if (!request.contains("rect") || !request["rect"].is_object()) return false;
	const auto &rect = request["rect"];
	for (const auto *key : {"x","y","width","height"}) if (!rect.contains(key) || !rect[key].is_number()) return false;
	const double x=rect["x"].get<double>(), y=rect["y"].get<double>(),
		width=rect["width"].get<double>(), height=rect["height"].get<double>();
	if (!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(width) || !std::isfinite(height)
	    || x < 0 || y < 0 || width < 32 || height < 32
	    || x+width > pie_GetVideoBufferWidth() || y+height > pie_GetVideoBufferHeight()) return false;
	towersIntel.x = int(std::lround(x)); towersIntel.y = int(std::lround(y));
	towersIntel.width = int(std::lround(width)); towersIntel.height = int(std::lround(height));
	towersIntel.rectValid = towersIntel.x+towersIntel.width <= pie_GetVideoBufferWidth()
		&& towersIntel.y+towersIntel.height <= pie_GetVideoBufferHeight();
	return towersIntel.rectValid;
}

static void towersIntelPoll()
{
	if (realTime-towersIntel.lastPoll < 75) return;
	towersIntel.lastPoll = realTime;
	FILE *file = fopen("/tmp/warzone-towers-intelligence-command.json","rb");
	if (!file) return;
	char buffer[8193];
	const size_t count = fread(buffer,1,sizeof(buffer),file);
	fclose(file);
	if (!count || count == sizeof(buffer)) return;
	const auto request = TowersIntelJson::parse(buffer,buffer+count,nullptr,false);
	if (request.is_discarded() || !request.is_object() || !request.contains("nonce") || !request["nonce"].is_string()) return;
	const auto nonce = request["nonce"].get<std::string>();
	if (nonce.empty() || nonce.size() > 128 || nonce == towersIntel.nonce) return;
	towersIntel.nonce = nonce;
	towersIntel.reply = {{"nonce",nonce},{"ok",false}};
	if (!request.contains("action") || !request["action"].is_string()) { towersIntel.reply["error"]="invalid-action"; return; }
	const auto action = request["action"].get<std::string>();
	const bool playAudio = request.contains("playAudio") && request["playAudio"].is_boolean() && request["playAudio"].get<bool>();
	if (action == "close")
	{
		towersIntelClose("closed");
		if (playAudio) audio_PlayTrack(ID_SOUND_WINDOWCLOSE);
		towersIntel.reply["ok"] = true;
		return;
	}
	if (selectedPlayer >= MAX_PLAYERS || asPlayerResList[selectedPlayer].size() != asResearch.size())
	{ towersIntel.reply["error"]="research-not-ready"; return; }
	if (InGameOpUp || isInGamePopupUp || bLoadSaveUp || intMode == INT_DESIGN || intMode == INT_INTELMAP)
	{ towersIntelClose("native-menu"); towersIntel.reply["error"]="native-menu"; return; }
	if (action == "open" || action == "list")
	{
		if (action == "open") towersIntelClose("opened");
		towersIntel.open = true;
		towersIntel.closedReason.clear();
		towersIntel.reply["history"] = TowersIntelJson::array();
		for (auto &research : asResearch)
			if (IsResearchCompleted(&asPlayerResList[selectedPlayer][research.index]))
				towersIntel.reply["history"].push_back(towersIntelSummary(research));
		if (action == "open" && playAudio) audio_PlayTrack(ID_SOUND_WINDOWOPEN);
	}
	else if (action == "select" || action == "layout" || action == "replay" || action == "highlight")
	{
		if (!request.contains("topicId") || !request["topicId"].is_string()) { towersIntel.reply["error"]="invalid-topic"; return; }
		const auto id = request["topicId"].get<std::string>();
		RESEARCH *research = towersIntelCompleted(id);
		if (!research) { towersIntel.reply["error"]="topic-not-completed"; return; }
		if (action == "highlight")
		{
			if (playAudio) audio_PlayTrack(ID_SOUND_BUTTON_CLICK_3);
		}
		else
		{
			towersIntel.open = true;
			if (towersIntel.topicId != id) { towersIntelStopAudio(); towersIntelRetireRect(); }
			towersIntel.topicId = id;
			if (action == "select" || request.contains("rect"))
			{
				const bool valid = towersIntelRect(request);
				if (request.contains("rect") && !valid) { towersIntel.reply["error"]="invalid-rect"; return; }
			}
			if (action == "select" || action == "replay")
			{
				for (MESSAGE *message : apsMessages[selectedPlayer])
					if (research->pViewData && message->type == MSG_RESEARCH && message->pViewData == research->pViewData) message->read = true;
				if (playAudio) { audio_PlayTrack(ID_SOUND_SELECT); towersIntelPlayReport(*research); }
			}
			towersIntel.reply["selected"] = towersIntelDetails(*research);
		}
	}
	else if (action == "heartbeat")
	{
		if (!towersIntel.open) { towersIntel.reply["error"]="not-open"; return; }
	}
	else { towersIntel.reply["error"]="invalid-action"; return; }
	towersIntel.closedReason.clear();
	towersIntel.lastActivity = realTime;
	towersIntel.reply["ok"] = true;
}

static bool towersIntelRender()
{
	if (!towersIntel.open) return false;
	if (realTime-towersIntel.lastActivity > 2500) { towersIntelClose("lease-expired"); return false; }
	if (!towersIntel.rectValid || towersIntel.topicId.empty()) return false;
	RESEARCH *research = towersIntelCompleted(towersIntel.topicId);
	std::string kind;
	if (!research) { towersIntelClose("topic-not-completed"); return false; }
	if (!towersIntelModel(*research,kind)) return false;
	if (towersIntel.x+towersIntel.width > pie_GetVideoBufferWidth() || towersIntel.y+towersIntel.height > pie_GetVideoBufferHeight()) return false;
	GLint viewport[4], oldScissor[4];
	GLfloat oldDepthRange[2];
	glGetIntegerv(GL_VIEWPORT,viewport);
	glGetIntegerv(GL_SCISSOR_BOX,oldScissor);
	glGetFloatv(GL_DEPTH_RANGE,oldDepthRange);
	const GLboolean wasScissor = glIsEnabled(GL_SCISSOR_TEST);
	const double sx = double(viewport[2])/pie_GetVideoBufferWidth(), sy = double(viewport[3])/pie_GetVideoBufferHeight();
	glEnable(GL_SCISSOR_TEST);
	glScissor(viewport[0]+int(std::floor(towersIntel.x*sx)),
		viewport[1]+int(std::floor((pie_GetVideoBufferHeight()-towersIntel.y-towersIntel.height)*sy)),
		int(std::ceil(towersIntel.width*sx)),int(std::ceil(towersIntel.height*sy)));
	pie_BeginInterface();
	pie_BoxFill(towersIntel.x,towersIntel.y,towersIntel.x+towersIntel.width,towersIntel.y+towersIntel.height,WZCOL_BLACK);
	// Fit the unchanged original 238x168 native preview projection into the slot.
	// These UI-only globals and GL state are restored before any other engine work.
	const int nativeWidth=pie_GetVideoBufferWidth(), nativeHeight=pie_GetVideoBufferHeight();
	const int oldOriginX=rendSurface.xcentre, oldOriginY=rendSurface.ycentre;
	const double fit=std::min(double(towersIntel.width)/238.0,double(towersIntel.height)/168.0);
	const double fittedWidth=238.0*fit, fittedHeight=168.0*fit;
	const double fittedX=towersIntel.x+(towersIntel.width-fittedWidth)/2.0;
	const double fittedY=towersIntel.y+(towersIntel.height-fittedHeight)/2.0;
	glViewport(viewport[0]+int(std::lround(fittedX*sx)),
		viewport[1]+int(std::lround((nativeHeight-fittedY-fittedHeight)*sy)),
		std::max(1,int(std::lround(fittedWidth*sx))),std::max(1,int(std::lround(fittedHeight*sy))));
	pie_SetVideoBufferWidth(238); pie_SetVideoBufferHeight(168);
	renderResearchToBuffer(research,119,84,true);
	pie_SetVideoBufferWidth(nativeWidth); pie_SetVideoBufferHeight(nativeHeight);
	pie_SetGeometricOffset(oldOriginX,oldOriginY);
	glViewport(viewport[0],viewport[1],viewport[2],viewport[3]);
	glDepthRangef(oldDepthRange[0],oldDepthRange[1]);
	glScissor(oldScissor[0],oldScissor[1],oldScissor[2],oldScissor[3]);
	if (!wasScissor) glDisable(GL_SCISSOR_TEST);
	++towersIntel.frames;
	return true;
}

static void towersIntelPublish(bool active)
{
	if (towersIntel.reply.is_null()) return;
	auto reply = towersIntel.reply;
	reply["gameTime"] = gameTime;
	reply["viewport"] = {{"width",pie_GetVideoBufferWidth()},{"height",pie_GetVideoBufferHeight()}};
	reply["preview"] = {{"active",active},{"topicId",towersIntel.topicId},{"frames",towersIntel.frames},
		{"realTime",realTime},{"rotationPeriodMs",2000},{"reason",towersIntel.closedReason},
		{"rect",{{"x",towersIntel.x},{"y",towersIntel.y},{"width",towersIntel.width},{"height",towersIntel.height}}}};
	const std::string bytes = reply.dump();
	FILE *file = fopen("/tmp/warzone-towers-intelligence-state.json.tmp","wb");
	if (file)
	{
		const bool wrote = fwrite(bytes.data(),1,bytes.size(),file) == bytes.size();
		const bool closed = fclose(file) == 0;
		if (wrote && closed) rename("/tmp/warzone-towers-intelligence-state.json.tmp","/tmp/warzone-towers-intelligence-state.json");
	}
	towersIntel.reply = nullptr;
}

static void towersIntelligenceFrame()
{
	if (!towersIntelEnabled())
	{ if (towersIntel.open) towersIntelClose("disabled"); towersIntelClearRetiredRects(); towersIntelPublish(false); return; }
	if (selectedPlayer >= MAX_PLAYERS || asResearch.empty() || asPlayerResList[selectedPlayer].size() != asResearch.size())
	{ if (towersIntel.open) towersIntelClose("research-not-ready"); towersIntelClearRetiredRects(); towersIntelPublish(false); return; }
	if (!towersIntel.initialCaptured)
	{
		towersIntel.initialCaptured = true;
		towersIntel.initialKnown = gameTime <= 1000;
		towersIntel.initialPlayer = selectedPlayer;
		if (towersIntel.initialKnown)
			for (const auto &research : asResearch)
				if (IsResearchCompleted(&asPlayerResList[selectedPlayer][research.index])) towersIntel.initialIds.insert(research.id.toUtf8());
	}
	if (gameTime < towersIntel.lastGameTime)
	{
		towersIntelClose("game-loaded");
		towersIntel.initialKnown = false;
		towersIntel.initialIds.clear();
	}
	towersIntel.lastGameTime = gameTime;
	if (InGameOpUp || isInGamePopupUp || bLoadSaveUp || intMode == INT_DESIGN || intMode == INT_INTELMAP)
		if (towersIntel.open) towersIntelClose("native-menu");
	towersIntelPoll();
	// A live world already replaced old pixels; paused scenes need explicit clear.
	towersIntelClearRetiredRects();
	const bool active = towersIntelRender();
	// Rendering may itself retire a lease/invalid selection. Clear that old
	// viewport before publishing its close acknowledgement as well.
	towersIntelClearRetiredRects();
	towersIntelPublish(active);
}
} // namespace
#else
namespace { static void towersIntelligenceReset() {} }
static void towersIntelligenceFrame() {}
#endif
