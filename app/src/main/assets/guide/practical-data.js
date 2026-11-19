/* Offline practical guide. Screenshots remain original captures; the viewer draws callouts. */
window.WarzoneGuidePracticalData = {
  version: 1,
  sourceMetadata: {
    auditedRelease: '0.67',
    auditedDate: '2026-11-13',
    scope: 'Public Towers, FFA and Campaign controls and phone features. Native mission rules and research availability remain authoritative.',
    sources: [
      {path: 'app/src/main/assets/warzone-touch-controls.js', areas: ['camera gestures', 'group selection', 'Unit controls drawer', 'STOP', 'BASE and native input ownership']},
      {path: 'app/src/main/assets/warzone-command-pages.js', areas: ['visible constructors', 'Build categories', 'line placement', 'modules', 'construction recovery', 'demolition', 'Manufacturing', 'Design', 'phone blueprints', 'cancellation']},
      {path: 'scenario/warzone-towers-commands.js', areas: ['native construction validation', 'footprint gaps', 'constructor queues', 'factory compatibility', 'module and unit limits']},
      {path: 'app/src/main/assets/warzone-mobile-research.js', areas: ['lab tabs', 'topic multi-selection', 'per-lab queues', '64-topic limit', 'Analysis']},
      {path: 'app/src/main/assets/warzone-intelligence.js', areas: ['native-issued completed research reports']},
      {path: 'app/src/main/assets/warzone-towers-wave-hud.js', areas: ['wave countdown', 'Skip Wave', 'partial enemy composition']},
      {path: 'app/src/main/assets/warzone-campaign-hud.js', areas: ['mission status', 'ALL COMBAT', 'native briefings', 'video and transporter input ownership']},
      {path: 'app/src/main/assets/warzone-ffa-hud.js', areas: ['actual bot identity', 'FFA no-air status']},
      {path: 'app/src/main/assets/warzone/saved-games.js', areas: ['explicit native saves', 'mode-separated restoration', 'FFA native identity validation']},
      {path: 'app/src/main/java/com/rbabbit/blocknight/warzone/FfaSetupView.java', areas: ['player-count map groups', 'per-group swipe selector', 'independent Cobra count', 'native difficulty', 'VTOL off', 'FFA saves entry']},
      {path: 'app/src/main/java/com/rbabbit/blocknight/warzone/FfaMapBrowserState.java', areas: ['remembered map per group', 'retired-group snap rejection', 'current launch identity']},
      {path: 'app/src/main/java/com/rbabbit/blocknight/warzone/FfaMapCatalog.java', areas: ['closed map identities', 'two-, three-, four- and six-player counts', 'native level compatibility']},
      {path: 'app/src/main/assets/ffa-maps.json', areas: ['authored map names, player counts, starting buildings and real previews']},
      {path: 'app/src/main/assets/warzone/music-loader.js', areas: ['MUSIC ON/OFF', '39-track FFA shuffle', 'three-track Campaign sequence', 'video pause and resume']},
      {path: 'app/src/main/assets/warzone/music-catalog.js', areas: ['bundled soundtrack playlist identities']},
      {path: 'app/src/main/java/com/rbabbit/blocknight/warzone/CampaignSetupView.java', areas: ['Alpha/Beta/Gamma', 'video package size', 'free-space requirement', 'New and Continue']},
      {path: 'app/src/main/java/com/rbabbit/blocknight/warzone/CampaignVideoStore.java', areas: ['offline installed media', 'download verification']},
      {path: 'app/src/main/java/com/rbabbit/blocknight/warzone/SavedGamesView.java', areas: ['mode labels', 'saved AI labels', 'load and confirmed deletion']},
      {path: 'app/src/main/java/com/rbabbit/blocknight/warzone/RewardCatalog.java', areas: ['portable structures', 'fortress and satellite limits', '25-percent research accelerator', '1000-power supply reserve']},
      {path: 'app/src/main/java/com/rbabbit/blocknight/warzone/RewardLedger.java', areas: ['cleared-wave rewards', 'victory and first-completion rewards', 'difficulty completion bonuses', 'saved-run anti-duplication']},
      {path: 'app/src/main/java/com/rbabbit/blocknight/warzone/MapLevelCatalog.java', areas: ['actual Towers difficulty groups and map counts']},
      {path: 'app/src/main/assets/warzone/levels/catalog.json', areas: ['16 Easy, 15 Medium and 15 Hard maps']},
      {path: 'scenario/ffa/stock/cobra/cobra_includes/tactics.js', areas: ['haveEnoughUnitsForFirstAttack: high-oil 120-unit unprovoked first-offensive condition']},
      {path: 'scenario/ffa/stock/cobra/cobra_includes/mapDynamics.js', areas: ['highOilMap classification']}
    ],
    nativeReferences: [
      {path: 'src/transporter.cpp', audit: 'Cached matched native source, read only', symbols: ['intProcessTransporter', 'IDTRANS_LAUNCH'], areas: ['available-unit loading', 'cargo removal while not flying', 'native launch control']}
    ],
    imagePolicy: 'Real unmodified captures, resolved by screenshotId. Callout rectangles use normalized image coordinates.',
    reviewNotes: [
      'The practical chapters describe the public Unit controls drawer, not the hidden Duel controls or obsolete Help labels.',
      'Cobra high-oil first-offensive threshold 120 is an army-size condition, not the number of oil sites on EMAG.',
      'Campaign objectives and transports are native mission features; this guide does not add a universal objective checklist.',
      'An optional screenshot may be absent when its real fixture has not been captured; no substitute gameplay image is generated.'
    ]
  },
  chapters: [
    {
      id: 'first-five-minutes', title: 'Your first five minutes',
      summary: 'Get oriented, secure power, choose research and put a small force to work.',
      pages: [
        {
          id: 'start-with-a-plan', title: 'Choose a battle and a research goal', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Start with Research', text: 'Use the Research reference to choose one useful weapon family, then look at its bodies, propulsion and economy support.'},
            {title: 'Choose your mode', text: 'Towers is wave survival. FFA is a battle against independent Cobra bots on your chosen map. Campaign follows the original story and mission objectives.'},
            {title: 'Begin simply', text: 'Choose an easier start while learning the controls. Check the units, buildings and technology you actually begin with; starts differ by map and mission.'}
          ],
          notes: ['Guide pages explain controls and choices. Opening the Guide does not unlock technology or award buildings.'],
          screenshotId: 'ffa-setup', callouts: [], related: ['section:research-overview', 'research-or-analysis', 'ffa-start', 'campaign-start']
        },
        {
          id: 'first-minute', title: 'Find your base and trucks', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Read the battlefield', text: 'Find your base, power total and starting constructors. Tap BASE to return to your Command Centre when one is available.'},
            {title: 'Move the view', text: 'Swipe with one finger to pan. Pinch for distance, twist with two fingers for direction, and move two fingers vertically together to tilt.'},
            {title: 'Select local builders', text: 'Keep your trucks visible, open Unit controls at bottom left and tap TRUCKS. Use BUILD when you are ready to choose a structure.'}
          ],
          notes: ['TRUCKS uses constructors visible in the current battlefield. It does not silently fetch a remote group.'],
          screenshotId: 'controls-world', callouts: [], related: ['camera-gestures', 'visible-builders']
        },
        {
          id: 'first-economy', title: 'Keep power coming in', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Check existing buildings', text: 'Use what the map or mission already provides before ordering duplicates. A functioning economy needs power generation and oil extraction.'},
            {title: 'Claim reachable oil', text: 'Choose an Oil Derrick when available and place it on a free oil resource. Keep the route reachable and protect exposed constructors.'},
            {title: 'Spend in stages', text: 'Balance new construction, research and manufacturing. If several jobs say WAITING FOR POWER, reduce new orders while income catches up.'}
          ],
          notes: ['Availability, limits, costs and build times come from the current native battle. A phone blueprint or reward does not make a structure free.'],
          screenshotId: 'build-sites', callouts: [], related: ['section:economy', 'build-spacing', 'research-lab-queue', 'production-stalled']
        },
        {
          id: 'first-research-and-force', title: 'Research, produce, then inspect', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Use a completed lab', text: 'Open RESEARCH, choose a lab and add a small sequence of available topics. Start with a focused plan rather than every branch at once.'},
            {title: 'Use a completed factory', text: 'Open MANUFACTURING, choose the factory and a compatible design, then add a small batch. Check QUEUE to see real accepted work.'},
            {title: 'Give a deliberate order', text: 'Select your combat units and tap clear terrain to move, or a visible enemy to attack. Save once the opening is stable.'}
          ],
          notes: ['Campaign may require a mission objective, artifact or briefing before more options become available.'],
          screenshotId: 'factory-units', callouts: [], related: ['research-lab-queue', 'make-a-batch', 'manual-save']
        }
      ]
    },
    {
      id: 'controls-and-orders', title: 'Controls and orders',
      summary: 'Move the camera, select units and issue orders without losing your work.',
      pages: [
        {
          id: 'camera-gestures', title: 'Pan, rotate, tilt and zoom', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'One finger: pan', text: 'Swipe across the battlefield to move the camera. Start on the world, away from panels and the minimap.'},
            {title: 'Two fingers: twist', text: 'Turn your fingers around each other to rotate freely in either direction. One finger may stay near a pivot while the other arcs around it.'},
            {title: 'Two fingers: distance or tilt', text: 'Spread or pinch to zoom. Move both fingers up or down together to tilt. Lift both fingers before starting a different gesture if the motion feels ambiguous.'}
          ],
          notes: ['Rotation can continue through a full turn and reverse. The gesture does not reset the camera to a preset heading.'],
          screenshotId: 'controls-world', callouts: [], related: ['select-and-order', 'input-troubleshooting']
        },
        {
          id: 'select-and-order', title: 'Select, move and attack', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Select a unit', text: 'Tap one of your units. Check its selection marker before giving an order, especially when several units overlap.'},
            {title: 'Select a group', text: 'Hold briefly on the battlefield, then drag a rectangle around your units. Release to finish the selection.'},
            {title: 'Order the selection', text: 'Tap reachable terrain to move. Tap a visible enemy to issue a contextual attack order. Constructors use their own valid build or demolition targets.'}
          ],
          notes: ['A quick swipe pans; a hold followed by a drag selects a group. Native pathfinding and weapon range still apply.'],
          screenshotId: 'controls-world', callouts: [], related: ['unit-drawer', 'visible-builders']
        },
        {
          id: 'unit-drawer', title: 'Use the Unit controls drawer', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Open the units icon', text: 'Tap the bottom-left Unit controls icon. On compact screens the drawer closes after an action; reopen it when needed.'},
            {title: 'Choose the right selection', text: 'ALL UNITS selects combat units. TRUCKS selects the visible construction group. DESELECT clears selection while existing orders continue.'},
            {title: 'Stop or open a tool', text: 'STOP stops the selected units; selected trucks also lose their remaining assigned work. DEMOLISH targets an owned structure. INTELLIGENCE opens available reports.'}
          ],
          notes: ['STOP is different from DESELECT. It affects selected units, rather than cancelling every job on the map.'],
          screenshotId: 'controls-drawer', callouts: [], related: ['demolish-a-structure', 'read-intelligence', 'construction-recovery']
        },
        {
          id: 'navigation-and-return', title: 'Navigate and return safely', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Use the minimap', text: 'Tap or drag the minimap to move the view. Use BASE to return to your Command Centre.'},
            {title: 'Close a panel first', text: 'Android Back closes the current panel first. Tap BUILD again to leave placement while accepted truck orders continue.'},
            {title: 'Save before leaving', text: 'Use SAVE and wait for confirmation. From the battlefield, Back opens Return to Main Menu.'},
            {title: 'Control the music', text: 'Tap MUSIC in the battle header, then ON or OFF. The menu shows the current title and artist; music settings leave sound effects unchanged.'}
          ],
          notes: ['Native dialogs, transports and videos temporarily own input. Finish or close that screen before using battlefield gestures.', 'One music setting is remembered across modes. FFA automatically advances through a 39-track shuffle without immediate repeats. Campaign starts randomly among its three original tracks, then cycles in order; videos pause and resume the song. A new mission or load can choose a fresh starting song. Towers loops its assigned map soundtrack.'],
          screenshotId: 'controls-world', callouts: [], related: ['manual-save', 'campaign-transporter', 'input-troubleshooting']
        }
      ]
    },
    {
      id: 'building-and-recovery', title: 'Build, upgrade and recover',
      summary: 'Use visible trucks, valid footprints and clear recovery actions.',
      pages: [
        {
          id: 'visible-builders', title: 'Build with the trucks you can see', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Frame your constructors', text: 'Move the camera until the intended trucks are visible. Tap Unit controls → TRUCKS, or select the intended constructors yourself.'},
            {title: 'Choose a structure', text: 'Open BUILD. Use DEFENCE, BASE, MODULES or ALL, then choose an available item from the list.'},
            {title: 'Place and verify', text: 'Tap a valid world site. Check the accepted blueprint and current construction status, rather than assuming that a tap created an order.'}
          ],
          notes: ['A changed camera view can require a fresh visible-truck selection. Build never substitutes distant constructors for an invalid local selection.'],
          screenshotId: 'build-sites', callouts: [], related: ['build-spacing', 'construction-recovery']
        },
        {
          id: 'build-spacing', title: 'Leave room for footprints and routes', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Use clear ground', text: 'Avoid existing buildings, units, obstacles and reserved queued footprints. A site must also be reachable by the assigned constructors.'},
            {title: 'Leave a gap at base buildings', text: 'Keep a full tile between ordinary base-building footprints. Walls and some defences can pack more closely; repair facilities need particular care.'},
            {title: 'Read the reason', text: 'If the site is obstructed or too close, choose a better position. A blocked accepted plan remains visible so you can Retry or remove it deliberately.'}
          ],
          notes: ['The displayed footprint and native site validation decide placement. A green-looking area is not a guarantee that every structure fits there.'],
          screenshotId: 'build-sites', callouts: [], related: ['defence-lines', 'construction-recovery']
        },
        {
          id: 'defence-lines', title: 'Lay out a defensive line', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Choose a line-capable defence', text: 'In BUILD, choose a normal defence, wall or gate that supports line placement. Keep the intended truck group selected.'},
            {title: 'Drag along the world', text: 'Drag from the first site toward the end of the line. Watch the preview and blocked-site count before releasing.'},
            {title: 'Check the accepted sites', text: 'Release to queue clear, reachable sites. Blocked sites are skipped; inspect the resulting line and fill intentional gaps with separate placements.'}
          ],
          notes: ['A line is limited to 64 sites. Purchased fortress rewards are placed individually, and normal power, spacing and limits still apply.'],
          screenshotId: 'build-sites', callouts: [], related: ['section:defences', 'build-spacing', 'visible-builders']
        },
        {
          id: 'building-modules', title: 'Put modules on matching buildings', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Choose MODULES', text: 'Open BUILD → MODULES and select the available factory, research or power upgrade you want.'},
            {title: 'Find the highlighted target', text: 'Tap a completed matching building with a free module slot. The guidance distinguishes eligible buildings, queued upgrades and full buildings.'},
            {title: 'Keep the builder working', text: 'Let the assigned constructor reach and upgrade the target. Check the queue if the job is waiting for power or the builder is lost.'}
          ],
          notes: ['Modules do not go on empty terrain, unfinished foundations, the wrong building type or a building that already has its maximum modules.'],
          screenshotId: 'build-modules', callouts: [], related: ['section:economy', 'construction-recovery', 'factory-families']
        },
        {
          id: 'construction-recovery', title: 'Recover a paused construction plan', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Read the current status', text: 'The Build summary shows one current unfinished site. Open QUEUE for other work, blocked reasons and removal controls; completed history can be expanded there.'},
            {title: 'Select replacements deliberately', text: 'Bring available constructors into view and explicitly select them. Clear an obstruction or choose the correct group before using RETRY.'},
            {title: 'Use the action shown', text: 'Towers and FFA retain builder-loss plans as WAITING FOR TRUCKS with RESUME. Campaign uses RETRY for the blocked job. Check the refreshed status after the action.'}
          ],
          notes: ['Retry validates the current selected trucks and site again. REMOVE cancels an order; an existing physical foundation may still need demolition.'],
          screenshotId: 'construction-recovery', callouts: [], related: ['visible-builders', 'demolish-a-structure', 'build-troubleshooting']
        },
        {
          id: 'demolish-a-structure', title: 'Demolish an owned structure', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Select constructors', text: 'Select the trucks that should perform the demolition, then open Unit controls → DEMOLISH.'},
            {title: 'Tap the owned target', text: 'Tap your structure or unfinished foundation. If another truck group is building that foundation, stop that group or cancel its order first.'},
            {title: 'Leave targeting when finished', text: 'Use CANCEL to leave demolition targeting. Use STOP if you need to stop the selected trucks after giving their order.'}
          ],
          notes: ['Your Command Centre is protected. REMOVE in QUEUE cancels planned work; it is not the command to demolish an existing structure.'],
          screenshotId: 'controls-drawer', callouts: [], related: ['unit-drawer', 'construction-recovery']
        }
      ]
    },
    {
      id: 'research-and-intelligence', title: 'Research, Analysis and Intelligence',
      summary: 'Choose technology, manage each lab and read the reports you actually earned.',
      pages: [
        {
          id: 'research-or-analysis', title: 'Choose research in the full page', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Open RESEARCH', text: 'Use the main RESEARCH button for topics and lab queues. Tapping one of your labs also opens research for that lab.'},
            {title: 'Use ANALYSIS for a glance', text: 'ANALYSIS in the footer is a compact view of live lab work. Use the full Research page when choosing or changing the plan.'},
            {title: 'Read prerequisites in the Guide', text: 'Use the Research reference to follow prerequisite branches and see unlocks or upgrades. In-battle availability remains the final check.'}
          ],
          notes: ['Research costs power and takes native time. Mission grants, artifacts and starting technology can make Campaign availability differ from a multiplayer prerequisite path.'],
          screenshotId: 'research-queue', callouts: [], related: ['section:research-overview', 'research-lab-queue', 'research-several-labs', 'read-intelligence']
        },
        {
          id: 'research-lab-queue', title: 'Queue topics in a chosen lab', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Choose the lab tab', text: 'Select the lab that should do the work. Check its current research and waiting queue.'},
            {title: 'Select available topics in order', text: 'Tap one or several available topics. Number badges show their selection order; tap a selected topic again to remove it from the selection.'},
            {title: 'Add the selection', text: 'Tap ADD TO LAB QUEUE. Review the accepted queue. Use × beside a waiting topic to remove that waiting entry.'}
          ],
          notes: ['Each lab queue holds up to 64 waiting topics. Completed, started or already queued topics cannot be duplicated in another lab.'],
          screenshotId: 'research-queue', callouts: [], related: ['research-several-labs', 'research-or-analysis']
        },
        {
          id: 'research-several-labs', title: 'Keep several labs useful', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Assign separate topics', text: 'Switch lab tabs and give each completed lab a useful available topic or short queue. A topic already assigned elsewhere is not a second copy to research.'},
            {title: 'Balance power', text: 'Watch ANALYSIS and the lab statuses. Low power can delay progress even when a queue is valid.'},
            {title: 'Revisit unlocked branches', text: 'After completion, inspect newly available topics. Research modules and upgrades can improve the economy or production as well as weapons.'}
          ],
          notes: ['The app does not promise that every lab can combine onto one topic. Times are estimates based on the current native state.'],
          screenshotId: 'research-queue', callouts: [], related: ['first-economy', 'building-modules', 'read-intelligence']
        },
        {
          id: 'read-intelligence', title: 'Read completed reports and briefings', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Open INTELLIGENCE', text: 'Expand Unit controls, then tap INTELLIGENCE. Choose a report that the native game has issued for this battle.'},
            {title: 'Use reports after completion', text: 'Research Intelligence is a reader for completed report-bearing technology. It is separate from the Research catalogue and its waiting queues.'},
            {title: 'Use Campaign briefings', text: 'In Campaign, MISSION BRIEFINGS opens the original native briefing and video list. Close that native screen to return to the battlefield.'}
          ],
          notes: ['Some upgrades have no report, and initially granted technology may not issue one. An empty Intelligence list does not mean the research system is broken.'],
          screenshotId: 'intelligence-report', callouts: [], related: ['research-or-analysis', 'campaign-briefings', 'reports-and-videos']
        }
      ]
    },
    {
      id: 'manufacturing-and-design', title: 'Manufacturing and blueprints',
      summary: 'Choose the right factory, add precise batches and keep reusable designs on your phone.',
      pages: [
        {
          id: 'factory-families', title: 'Choose a completed factory', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Open the full page', text: 'Use the main MANUFACTURING button for Units, Design and Blueprints. The footer Manufacturing view is a compact status display.'},
            {title: 'Choose family and factory', text: 'Use Vehicles, Cyborgs or VTOL when that completed factory family exists. Select the numbered factory that should receive the order.'},
            {title: 'Choose a compatible recipe', text: 'Vehicle designs use a vehicle factory; cyborg recipes need a completed Cyborg Factory. Read RESEARCH REQUIRED or FACTORY MODULES REQUIRED before producing.'}
          ],
          notes: ['Build the matching available factory through BUILD → BASE. FFA has no VTOL family; heavier vehicle designs may require factory modules.'],
          screenshotId: 'factory-units', callouts: [], related: ['section:cyborgs', 'make-a-batch', 'building-modules', 'design-a-unit']
        },
        {
          id: 'make-a-batch', title: 'Add the quantity you mean', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Check the selected factory', text: 'Confirm the family and numbered factory before adding units. Orders belong to that factory.'},
            {title: 'Choose ADD 1, 5, 10 or 20', text: 'ADD is the quantity for the next Produce tap. Read the PRODUCE number before tapping it.'},
            {title: 'Wait for acceptance', text: 'ADDING becomes confirmation or a reason. Inspect the current unit and waiting count. A later Produce tap adds another batch.'}
          ],
          notes: ['ADD is not a target total and does not replace the existing queue. Units use normal power and manufacturing time.'],
          screenshotId: 'factory-units', callouts: [], related: ['manufacturing-queue', 'production-stalled']
        },
        {
          id: 'manufacturing-queue', title: 'Inspect and cancel manufacturing', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Read NOW and WAITING', text: 'The factory strip separates the current unit from waiting units. SHOW QUEUE expands that factory’s waiting list; CLEAR WAITING removes its waiting work.'},
            {title: 'Use the main QUEUE page', text: 'Open QUEUE for live manufacturing and construction together. Each factory row identifies its current unit and grouped waiting orders.'},
            {title: 'Cancel the intended work', text: 'CANCEL beside the current unit cancels current manufacturing. Waiting controls cancel one waiting unit or the displayed group; check the refreshed counts.'}
          ],
          notes: ['Clearing waiting work preserves the current unit. A cancellation is confirmed from native state, so wait before relying on the new queue.'],
          screenshotId: 'factory-queue', callouts: [], related: ['make-a-batch', 'production-stalled']
        },
        {
          id: 'design-a-unit', title: 'Create a researched unit design', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Complete a Command Centre', text: 'A completed Command Centre is required to save designs. Open MANUFACTURING → Design.'},
            {title: 'Choose the components', text: 'Choose a body, propulsion, then weapon or system. Use only researched, compatible parts and fill the required slots. Engineering uses a construction system.'},
            {title: 'Name and save', text: 'Read the validation message and cost, give the unit a name, then SAVE BLUEPRINT. Editing offers SAVE CHANGES or SAVE AS NEW.'}
          ],
          notes: ['Saving a design is not a manufacturing order. Select a compatible completed factory and Produce it separately. Cyborg factory recipes remain family-specific.'],
          screenshotId: 'design-blueprint', callouts: [], related: ['section:vehicles', 'phone-blueprints', 'factory-families']
        },
        {
          id: 'phone-blueprints', title: 'Reuse designs from your phone', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Save a useful recipe', text: 'Create a blueprint in Design, or select a native factory recipe and use the options menu → SAVE DESIGN TO PHONE.'},
            {title: 'Open the library', text: 'Use Blueprints or BLUEPRINT LIBRARY in the Manufacturing options menu. Select a saved recipe to inspect or use it.'},
            {title: 'Research it in each battle', text: 'The recipe persists on this phone across games. Research its components again in the current battle, then use the correct factory and modules.'}
          ],
          notes: ['A persistent blueprint stores a recipe. It does not transfer technology, units, power or campaign progress into another match.'],
          screenshotId: 'phone-blueprints', callouts: [], related: ['design-a-unit', 'production-stalled', 'manual-save']
        }
      ]
    },
    {
      id: 'towers-survival', title: 'Towers: waves and survival',
      summary: 'Prepare between waves, read the enemies actually selected and protect your base.',
      pages: [
        {
          id: 'towers-wave-flow', title: 'Prepare for the next wave', modes: ['towers'],
          steps: [
            {title: 'Read the wave display', text: 'Check the current wave, remaining hostiles and next-wave countdown. Repair your position, replace losses and keep labs and factories useful.'},
            {title: 'Keep routes open', text: 'Use defensive lines with space for your constructors and combat units to travel. Protect the economy as well as the approach to the base.'},
            {title: 'Skip only when ready', text: 'SKIP WAVE starts the next wave sooner. Surviving enemies stay on the battlefield, so skipping can create overlapping threats.'}
          ],
          notes: ['Starting a wave is not the same as clearing it. Rewards use waves the native game actually marks complete.'],
          screenshotId: 'towers-wave', callouts: [], related: ['section:defences', 'towers-enemy-info', 'towers-command-centre', 'completion-and-crystals']
        },
        {
          id: 'towers-enemy-info', title: 'Read incoming enemy information', modes: ['towers'],
          steps: [
            {title: 'Watch the incoming badge', text: 'The wave badge shows the wave and selected enemy count. Open its detail when the native wave has selected units to report.'},
            {title: 'Treat partial lists as partial', text: 'Enemy units selected so far is a live selection list. More units can appear while the wave is still being assembled or spawned.'},
            {title: 'Adapt to the real force', text: 'Use the actual enemy composition and battlefield to choose targets, weapon research and defences. Do not assume a count-only preview names every future unit.'}
          ],
          notes: ['Before detailed unit selection exists, the display can show only a total and its detail control may be unavailable.'],
          screenshotId: 'towers-wave', callouts: [], related: ['towers-wave-flow', 'research-or-analysis']
        },
        {
          id: 'towers-command-centre', title: 'Keep the base working', modes: ['towers'],
          steps: [
            {title: 'Protect the Command Centre', text: 'Use BASE to locate it and defend the routes around it. Keep constructors able to reach damaged or unfinished positions.'},
            {title: 'Preserve your support', text: 'Replace lost builders and maintain power, labs and factories. A large defence line is hard to recover if its constructors or economy disappear.'},
            {title: 'Follow the native result', text: 'The battle’s own victory or defeat result decides the outcome. Save a stable position before leaving and use the result receipt after a completed run.'}
          ],
          notes: ['The Command Centre is protected from the app demolition tool. The guide does not replace a map’s native end conditions.'],
          screenshotId: 'controls-world', callouts: [], related: ['construction-recovery', 'manual-save', 'completion-and-crystals']
        },
        {
          id: 'towers-map-progress', title: 'Choose maps and track completion', modes: ['towers'],
          steps: [
            {title: 'Choose a difficulty group', text: 'Open Towers and browse its actual map catalogue. Easy, Medium and Hard have separate sets of maps.'},
            {title: 'Use the completion markers', text: 'A star or Complete marker records a native victory on that map. Replaying is still possible; the first-completion reward is not repeated.'},
            {title: 'Finish a whole group', text: 'Complete every map in a difficulty group to earn its one-time 1,000-crystal bonus. The groups contain 16 Easy, 15 Medium and 15 Hard maps.'}
          ],
          notes: ['Map completion belongs to Towers. Campaign missions and FFA wins do not fill this catalogue or award its crystals.'],
          screenshotId: 'towers-map', callouts: [], related: ['completion-and-crystals', 'towers-reward-stock']
        }
      ]
    },
    {
      id: 'ffa-cobra', title: 'FFA: maps and Cobra opponents',
      summary: 'Choose a player count and map, build a ground army and understand the high-oil opening.',
      pages: [
        {
          id: 'ffa-start', title: 'Choose an FFA map', modes: ['ffa'],
          steps: [
            {title: 'Choose players, then a map', text: 'Home → FFA has 15 new maps each under 2 players, 3 players and 4 players. Originals keeps EMAG FFA, Contact, Ng-TemplarFFA, RB-Simple, RB_Usefull and EMAJ-6P. Swipe the preview or use its arrow.'},
            {title: 'Read this map’s details', text: 'Two players means you and one Cobra bot; three means two bots; four means three bots. EMAJ-6P has five bots. Each map card shows its starting buildings and oil. The selected map is retained when returning from FFA SAVES.'},
            {title: 'Choose difficulty and start', text: 'Choose Easy, Medium or Hard, then START FFA. The difficulty applies to every bot. All opponents are independent enemies; VTOL stays OFF.'}
          ],
          notes: ['All new FFA matches use Cobra. A legacy EMAG save may still contain NullBot and keeps its actual bots. The illustration is the previous v0.66 browser; the current browser adds player-count groups above difficulty.'],
          screenshotId: 'ffa-setup', callouts: [], related: ['ffa-economy', 'ffa-high-oil', 'ffa-no-air-and-legacy']
        },
        {
          id: 'ffa-economy', title: 'Turn oil into a sustainable army', modes: ['ffa'],
          steps: [
            {title: 'Inspect your authored base', text: 'Check the selected map’s starting buildings before ordering duplicates. Contact starts without labs or factories; other maps may provide labs or completed factories.'},
            {title: 'Research a coherent ground force', text: 'Choose a weapon branch and the bodies, propulsion and upgrades that support it. Use additional labs for separate useful topics.'},
            {title: 'Expand production deliberately', text: 'Claim reachable oil and protect constructors. Complete any needed factories, add modules and use manageable batches. Keep power for research and replacement trucks.'}
          ],
          notes: ['FFA uses native research, power, production, pathfinding and victory rules. Towers waves, purchases and crystal rewards do not apply.'],
          screenshotId: 'factory-units', callouts: [], related: ['section:vehicles', 'first-economy', 'research-several-labs', 'factory-families']
        },
        {
          id: 'ffa-high-oil', title: 'Understand Cobra’s high-oil buildup', modes: ['ffa'],
          steps: [
            {title: 'Expect an economy phase', text: 'On a high-oil map such as EMAG, Cobra can spend an early period building its economy, researching and assembling a large force.'},
            {title: 'Understand the 120 condition', text: 'When Cobra classifies a map as high-oil, its unprovoked opening waits for 120 units in its attack groups before its first offensive. This is an army-size condition, not 120 oil wells.'},
            {title: 'Stay prepared', text: 'A quiet opening is not proof that the AI is inactive. Defensive reactions and other native decisions can happen sooner, so scout and strengthen your position.'}
          ],
          notes: ['The opening threshold does not promise that every attack waits for 120 units, or that every difficulty behaves identically at a fixed time.'],
          screenshotId: 'factory-units', callouts: [], related: ['ffa-economy', 'ffa-start']
        },
        {
          id: 'ffa-no-air-and-legacy', title: 'No air, and honest saved-game labels', modes: ['ffa'],
          steps: [
            {title: 'Plan for ground combat', text: 'VTOL is OFF. FFA does not provide VTOL aircraft, VTOL factories or rearm pads. Use the reachable ground technology and factories.'},
            {title: 'Read the saved bot label', text: 'FFA SAVES identifies Cobra or legacy NullBot matches. Loading an old NullBot save keeps its actual bots and native world.'},
            {title: 'Start fresh for Cobra', text: 'Return to FFA setup, choose a map and use START FFA for a new Cobra match. Resaving an old match does not convert its AI or map.'}
          ],
          notes: ['Some anti-air research can remain native-valid even with no VTOL opponents. The guide does not claim that every AA topic has been removed.'],
          screenshotId: 'phone-saves', callouts: [], related: ['manual-save', 'ffa-start', 'save-troubleshooting']
        }
      ]
    },
    {
      id: 'campaign-missions', title: 'Campaign: missions and transports',
      summary: 'Follow the original objectives, recover technology and use native mission screens.',
      pages: [
        {
          id: 'campaign-start', title: 'Prepare the story campaign', modes: ['campaign'],
          steps: [
            {title: 'Install the original videos', text: 'Open Campaign and use DOWNLOAD VIDEOS · 205 MB. Allow 500 MB of free space and wait for download and verification to finish.'},
            {title: 'Begin with Alpha', text: 'Use NEW CAMPAIGN when ready. The original sequence continues through Alpha, Beta and Gamma with its own mission rules and technology progression.'},
            {title: 'Continue a saved world', text: 'Use CONTINUE for Campaign saves. Campaign archives are separate from Towers and FFA saves.'}
          ],
          notes: ['Once the video package is installed, it is available offline. A new campaign is gated until the required package is ready.'],
          screenshotId: 'campaign-briefing', callouts: [], related: ['campaign-objectives', 'campaign-briefings', 'manual-save']
        },
        {
          id: 'campaign-objectives', title: 'Follow the current mission', modes: ['campaign'],
          steps: [
            {title: 'Read and listen to the briefing', text: 'Use the original mission instructions, messages and map cues. Objectives vary: exploration, destruction, recovery, defence and evacuation are mission-specific.'},
            {title: 'Recover technology deliberately', text: 'Reach mission artifacts and follow the native instructions. Artifacts and scripted mission grants can make new research available.'},
            {title: 'Check the mission situation', text: 'Watch the chapter and any mission timer, protect required assets and follow the native completion or evacuation trigger.'}
          ],
          notes: ['There is no added universal objective-checklist panel. The original mission scripts decide progress, victory and defeat.'],
          screenshotId: 'campaign-briefing', callouts: [], related: ['campaign-briefings', 'campaign-transporter', 'research-or-analysis']
        },
        {
          id: 'campaign-transporter', title: 'Load and launch a transporter', modes: ['campaign'],
          steps: [
            {title: 'Open the native transporter screen', text: 'When the mission provides a transporter, select it and use its native transport interface. The app’s battlefield controls yield to this screen.'},
            {title: 'Manage its cargo', text: 'Use the available-unit list to add permitted units. A cargo item can be removed while the transporter is not flying; respect the displayed capacity and mission rules.'},
            {title: 'Launch when ready', text: 'Use the native Launch Transport control when the mission permits it. Wait for the native flight or arrival state before issuing the next transport action.'}
          ],
          notes: ['Transport availability, capacity, reinforcements and launch conditions vary by mission. A normal movement order is not a substitute for loading or launching.'],
          screenshotId: 'campaign-transport', callouts: [], related: ['campaign-objectives', 'navigation-and-return']
        },
        {
          id: 'campaign-briefings', title: 'Replay briefings and control your force', modes: ['campaign'],
          steps: [
            {title: 'Open MISSION BRIEFINGS', text: 'Use Unit controls → INTELLIGENCE → MISSION BRIEFINGS to return to the original native briefing and video list.'},
            {title: 'Let native screens own input', text: 'During a video, briefing or transport screen, finish or close that screen before trying to pan, build or issue field orders.'},
            {title: 'Use ALL COMBAT deliberately', text: 'Campaign’s ALL COMBAT keeps combat units selected. It excludes constructors, sensors, repair units and transports; switch it off before choosing a smaller working group.'}
          ],
          notes: ['ALL COMBAT temporarily suspends its selection refresh while menus or protected native screens are active. Original videos are not replaced with Guide images.'],
          screenshotId: 'campaign-briefing', callouts: [], related: ['read-intelligence', 'select-and-order', 'reports-and-videos']
        }
      ]
    },
    {
      id: 'saves-and-rewards', title: 'Saves, stars and rewards',
      summary: 'Keep native matches on your phone and understand Towers-only progress and stock.',
      pages: [
        {
          id: 'manual-save', title: 'Save and load the native battle', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Save from the running battlefield', text: 'Tap SAVE in the game header and wait for Game saved. Save before returning to the menu or leaving a position you want to keep.'},
            {title: 'Open the matching list', text: 'Use Saved Games inside Towers, CONTINUE inside Campaign, or FFA SAVES inside FFA. Choose the named match from that mode’s list.'},
            {title: 'Check the restored world', text: 'Wait for the battle to resume, then inspect your units, research, construction and factory queues before giving new orders.'}
          ],
          notes: ['Saves are local to this phone. Do not rely on an automatic save when leaving; the explicit save confirmation is the check.'],
          screenshotId: 'phone-saves', callouts: [], related: ['save-troubleshooting', 'phone-blueprints', 'ffa-no-air-and-legacy']
        },
        {
          id: 'completion-and-crystals', title: 'Earn Towers completion rewards', modes: ['towers'],
          steps: [
            {title: 'Clear waves', text: 'Each actually completed wave earns 5 crystals. A wave that has merely started does not count as cleared.'},
            {title: 'Win the map', text: 'A native victory adds 60 crystals on Easy, 80 on Medium or 100 on Hard. The first completion of that map adds another 50.'},
            {title: 'Complete a difficulty group', text: 'Winning every actual map in Easy, Medium or Hard gives that group’s one-time 1,000-crystal bonus. Completion stars and Complete markers show map history.'}
          ],
          notes: ['Saved-run accounting prevents the same cleared waves or first-completion bonuses paying repeatedly. FFA and Campaign do not award these rewards.'],
          screenshotId: 'towers-map', callouts: [], related: ['towers-map-progress', 'towers-reward-stock']
        },
        {
          id: 'towers-reward-stock', title: 'Use purchased Towers stock', modes: ['towers'],
          steps: [
            {title: 'Read the item before buying', text: 'Open Rewards from Towers. Building purchases add a limited portable stock allowance for Towers, rather than placing an instant structure.'},
            {title: 'Build the purchased item normally', text: 'Use BUILD with constructors and a valid site. Normal power, building time and remaining stock limits still apply.'},
            {title: 'Check match limits', text: 'Fortress types share a maximum of three purchased fortresses in one match. The Laser Satellite Command Post has a one-per-match allowance.'}
          ],
          notes: ['Unused-stock handling follows the verified remaining match inventory. Do not assume that every purchase is unconditionally refunded on exit.'],
          screenshotId: 'towers-rewards', callouts: [], related: ['towers-support-boosts', 'visible-builders', 'defence-lines']
        },
        {
          id: 'towers-support-boosts', title: 'Use one-match support boosts', modes: ['towers'],
          steps: [
            {title: 'Research accelerator', text: 'For 60 crystals, lab research rate increases by 25% for one Towers match. You still choose and pay for the topics; the boost does not complete the research tree.'},
            {title: 'Supply reserve', text: 'For 30 crystals, start one Towers match with 1,000 extra power. Spend it through ordinary construction, research and manufacturing.'},
            {title: 'Earn crystals through play', text: 'Each completed wave earns 5 crystals. Keep playing to earn more for Rewards purchases.'}
          ],
          notes: ['These are Towers support purchases. They do not apply to Campaign or FFA and are separate from persistent phone blueprints.'],
          screenshotId: 'towers-rewards', callouts: [], related: ['towers-reward-stock', 'completion-and-crystals', 'phone-blueprints']
        }
      ]
    },
    {
      id: 'troubleshooting', title: 'Troubleshooting',
      summary: 'Read the live reason, restore the right selection and retry only the affected action.',
      pages: [
        {
          id: 'input-troubleshooting', title: 'The view or order is not responding', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Find who owns input', text: 'Close the current app panel with Back. If a native briefing, transport screen, menu or video is open, finish or close it first.'},
            {title: 'Start a clean gesture', text: 'Lift every finger, then start on clear battlefield terrain. Keep pinch radial, tilt parallel and rotation a deliberate twist; do not begin on a control or minimap.'},
            {title: 'Recheck the selection', text: 'Tap the intended unit or use a fresh group selection. DESELECT keeps old orders; STOP changes them. For Build, select visible constructors again after moving the camera.'}
          ],
          notes: ['A blocked path, unreachable enemy or native pause can prevent progress even when the tap was accepted. Inspect the actual unit and current screen.'],
          screenshotId: 'controls-drawer', callouts: [], related: ['camera-gestures', 'unit-drawer', 'navigation-and-return']
        },
        {
          id: 'build-troubleshooting', title: 'Construction is queued but not advancing', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Read QUEUE and the site', text: 'Check for power shortage, an obstructed footprint, another group owning the foundation or lost constructors. Completed history is not a current work order.'},
            {title: 'Repair the specific cause', text: 'Restore power or clear the route. Select replacement constructors explicitly; use RETRY, or RESUME on a retained Towers/FFA builder-loss plan.'},
            {title: 'Replace an invalid plan', text: 'If the site cannot work, REMOVE the order and choose a valid location. Demolish an existing foundation separately when it must be removed.'}
          ],
          notes: ['Modules require a completed matching target with a free slot. Retrying does not borrow remote trucks or bypass native placement rules.'],
          screenshotId: 'build-sites', callouts: [], related: ['construction-recovery', 'building-modules', 'demolish-a-structure']
        },
        {
          id: 'production-stalled', title: 'A design cannot produce, or production waits', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Check the battle requirements', text: 'Research the saved recipe’s components in this battle. Select a completed factory of the correct family and add required vehicle factory modules.'},
            {title: 'Read the live status', text: 'WAITING FOR POWER needs income. WAITING FOR CAPACITY needs room under the displayed unit limit; recycle an appropriate unit or reduce waiting work.'},
            {title: 'Inspect the right queue', text: 'Check the numbered factory and current versus waiting counts. Clear only unwanted waiting units, or use the main QUEUE page to cancel current manufacturing deliberately.'}
          ],
          notes: ['Saving a blueprint does not grant technology. Saving a new design requires a completed Command Centre. FFA has no VTOL production.'],
          screenshotId: 'factory-queue', callouts: [], related: ['phone-blueprints', 'factory-families', 'manufacturing-queue']
        },
        {
          id: 'reports-and-videos', title: 'A report, topic or video seems missing', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Use the correct page', text: 'RESEARCH chooses topics. ANALYSIS shows lab status. INTELLIGENCE reads native-issued completed reports; it is not a second research catalogue.'},
            {title: 'Check the native unlock', text: 'A topic may need prerequisites, a Campaign artifact or mission progress. Initial grants and some upgrades do not issue an Intelligence report.'},
            {title: 'Check Campaign media readiness', text: 'Use Campaign setup to finish the required video download and verification. Replay available native videos through INTELLIGENCE → MISSION BRIEFINGS.'}
          ],
          notes: ['This offline Guide explains the bundled technology. It does not bypass mission gates or install the separate original Campaign video package.'],
          screenshotId: 'intelligence-report', callouts: [], related: ['research-or-analysis', 'read-intelligence', 'campaign-start']
        },
        {
          id: 'save-troubleshooting', title: 'A saved match is missing or cannot load', modes: ['towers', 'ffa', 'campaign'],
          steps: [
            {title: 'Use the same mode’s save list', text: 'Check Towers Saved Games, Campaign CONTINUE or FFA SAVES. A save in one mode is not listed as a match in another.'},
            {title: 'Confirm the original save finished', text: 'A previous tap is not enough: wait for Game saved before leaving. Check free phone storage if a save or media download reports a failure.'},
            {title: 'Respect identity errors', text: 'Read the error and keep the original archive. An FFA save must agree with its actual difficulty, map and AI; an old NullBot match stays NullBot.'}
          ],
          notes: ['Deleting a saved match is a separate confirmed action. A phone blueprint is a reusable recipe, not a replacement for a native battle save.'],
          screenshotId: 'phone-saves', callouts: [], related: ['manual-save', 'ffa-no-air-and-legacy', 'phone-blueprints']
        }
      ]
    }
  ]
};
