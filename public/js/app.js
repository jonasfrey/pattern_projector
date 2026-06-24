/* Template Projector — Vue 3 SPA */
const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

/* ---------------- API helper ---------------- */
const api = {
  async json(url, opts = {}) {
    const res = await fetch(url, {
      headers: { "content-type": "application/json" },
      ...opts,
    });
    const body = res.headers.get("content-type")?.includes("json")
      ? await res.json()
      : await res.text();
    if (!res.ok) throw new Error((body && body.error) || `HTTP ${res.status}`);
    return body;
  },
  get(u) { return this.json(u); },
  post(u, data) { return this.json(u, { method: "POST", body: JSON.stringify(data) }); },
  put(u, data) { return this.json(u, { method: "PUT", body: JSON.stringify(data) }); },
  del(u) { return this.json(u, { method: "DELETE" }); },
};

/* ---------------- Draggable / resizable overlay ---------------- */
const OverlayWindow = {
  props: {
    id: String, title: String, icon: String,
    initial: { type: Object, default: () => ({}) },
  },
  emits: ["close", "focus"],
  setup(props, { emit }) {
    const KEY = `overlay:${props.id}`;
    const saved = JSON.parse(localStorage.getItem(KEY) || "null") || {};
    const state = reactive({
      x: saved.x ?? props.initial.x ?? 80,
      y: saved.y ?? props.initial.y ?? 80,
      w: saved.w ?? props.initial.w ?? 320,
      h: saved.h ?? props.initial.h ?? 360,
      z: saved.z ?? 10,
    });
    const persist = () => localStorage.setItem(KEY, JSON.stringify(state));

    let drag = null;
    const startDrag = (e) => {
      emit("focus", props.id);
      const p = pt(e);
      drag = { dx: p.x - state.x, dy: p.y - state.y };
      bind(onDrag, endDrag);
    };
    const onDrag = (e) => {
      const p = pt(e);
      state.x = Math.max(0, p.x - drag.dx);
      state.y = Math.max(0, p.y - drag.dy);
    };
    const endDrag = () => { drag = null; persist(); unbind(onDrag, endDrag); };

    let rz = null;
    const startResize = (e) => {
      e.stopPropagation();
      emit("focus", props.id);
      const p = pt(e);
      rz = { px: p.x, py: p.y, w: state.w, h: state.h };
      bind(onResize, endResize);
    };
    const onResize = (e) => {
      const p = pt(e);
      state.w = Math.max(240, rz.w + (p.x - rz.px));
      state.h = Math.max(140, rz.h + (p.y - rz.py));
    };
    const endResize = () => { rz = null; persist(); unbind(onResize, endResize); };

    function pt(e) {
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX, y: t.clientY };
    }
    function bind(m, u) {
      window.addEventListener("mousemove", m);
      window.addEventListener("mouseup", u);
      window.addEventListener("touchmove", m, { passive: false });
      window.addEventListener("touchend", u);
    }
    function unbind(m, u) {
      window.removeEventListener("mousemove", m);
      window.removeEventListener("mouseup", u);
      window.removeEventListener("touchmove", m);
      window.removeEventListener("touchend", u);
    }

    const setZ = (z) => { state.z = z; persist(); };
    const styleObj = computed(() => ({
      left: state.x + "px", top: state.y + "px",
      width: state.w + "px", height: state.h + "px", zIndex: state.z,
    }));

    return { state, styleObj, startDrag, startResize, setZ, emit };
  },
  template: `
    <div class="overlay" :style="styleObj" @mousedown="$emit('focus', id)">
      <div class="overlay-title" @mousedown="startDrag" @touchstart="startDrag">
        <span class="t">{{ icon }} {{ title }}</span>
        <button class="close" @click.stop="$emit('close', id)" aria-label="Close">✕</button>
      </div>
      <div class="overlay-body"><slot></slot></div>
      <div class="resize-handle" @mousedown="startResize" @touchstart.prevent="startResize"></div>
    </div>`,
};

/* ---------------- Main template ---------------- */
const MAIN_TEMPLATE = `
<div class="topbar">
  <h1>📐 Template Projector v1.0</h1>
  <div class="toolbar">
    <button :class="{active: overlays.upload}" @click="toggle('upload')">📁 Load Pattern</button>
    <button :class="{active: overlays.calibrate}" @click="toggle('calibrate')">⚙️ Calibrate</button>
    <button :class="{active: locked}" @click="toggleLock()">{{ locked ? '🔒 Locked' : '🔓 Lock' }}</button>
    <button :class="{active: overlays.controls}" @click="toggle('controls')">✏️ Controls</button>
    <button :class="{active: overlays.project}" @click="toggle('project')">💾 Project</button>
    <button :class="{active: overlays.regions}" @click="toggle('regions')">🔲 Regions</button>
    <button :class="{active: overlays.persons}" @click="toggle('persons')">👤 Person</button>
    <button :class="{active: overlays.sizeGuide}" @click="toggle('sizeGuide')">📏 Size Guide</button>
    <button :class="{active: overlays.logs}" @click="toggle('logs')">📊 Logs</button>
    <button @click="view.grid = !view.grid" :class="{active: view.grid}">▦ Grid</button>
  </div>
</div>

<div class="workspace">
  <div v-if="view.grid" class="grid-overlay" :style="gridStyle"></div>

  <div class="stage" :class="{'draw-mode': regionDrawMode}" @wheel="onStageWheel">
    <div v-if="pattern" class="pattern-host" :style="hostStyle"
      @mousedown="regionDrawMode ? startRegionDraw($event) : startPatternDrag($event)"
      @touchstart="regionDrawMode ? startRegionDraw($event) : startPatternDrag($event)">
      <div v-if="patternMarkup" v-html="patternMarkup"></div>
      <img v-else-if="patternImgUrl" :src="patternImgUrl" :width="pattern.width" :height="pattern.height" alt="pattern" draggable="false" />
    </div>
    <div v-else class="empty-hint">
      <div class="big">📐</div>
      <div>Load a pattern to begin</div>
      <div style="margin-top:.6rem"><button class="primary" @click="toggle('upload')">📁 Load Pattern</button></div>
    </div>
  </div>

  <!-- Region outlines -->
  <svg v-if="pattern && regions.length" class="region-outlines">
    <polygon v-for="r in regions" :key="r.id" :points="regionScreenPoints(r)"
      :class="{open: regionOpen[r.id]}" />
  </svg>
  <!-- Live rubber-band rectangle while drawing a new region -->
  <div v-if="drawingRect" class="drawing-rect" :style="drawingRectStyle"></div>

  <!-- Zoom anchor marker -->
  <div v-if="zoomAnchor && pattern" class="zoom-anchor-marker" :style="anchorMarkerStyle"></div>

  <!-- Controls legend -->
  <div class="controls-hint">
    <div v-if="regionDrawMode"><span class="key">Drag on pattern</span>Draw region</div>
    <template v-else>
      <div><span class="key">Drag pattern</span>Move</div>
      <div><span class="key">Click pattern</span>Set zoom anchor</div>
      <div><span class="key">Shift + Scroll</span>Zoom</div>
      <div><span class="key">Ctrl + Scroll</span>Rotate</div>
    </template>
  </div>

  <!-- Status HUD -->
  <div class="hud">
    <div><span class="ws-dot" :class="wsConnected?'on':'off'"></span>
      {{ wsConnected ? 'Connected' : 'Offline' }}</div>
    <div v-if="pattern">Pattern: {{ pattern.name }} · {{ pattern.width }}×{{ pattern.height }}px</div>
    <div v-if="pattern">Scale: <span class="scale">{{ scale.toFixed(3) }}x</span></div>
    <div v-if="pattern">
      <span class="badge" :class="locked?'locked':'unlocked'">{{ locked?'🔒 Locked':'🔓 Unlocked' }}</span>
      <span class="badge" :class="calibrated?'cal':'uncal'">{{ calibrated?'✅ Calibrated':'⚠ Uncalibrated' }}</span>
    </div>
  </div>

  <!-- ===== Overlay: Upload ===== -->
  <overlay-window v-if="overlays.upload" :ref="setRef('upload')" id="upload" title="Load Pattern" icon="📁"
    :initial="{x:60,y:70,w:340,h:430}" @close="toggle('upload')" @focus="focusOverlay">
    <div class="field">
      <label>Upload Pattern File</label>
      <div class="dropzone" :class="{drag: dragOver}"
        @click="$refs.file.click()"
        @dragover.prevent="dragOver=true" @dragleave="dragOver=false"
        @drop.prevent="dragOver=false; uploadFile($event.dataTransfer.files[0])">
        Drag &amp; Drop or Click to Upload<br>
        <small>Supported: SVG, PDF, DXF, AI · Max 50MB</small>
      </div>
      <input ref="file" type="file" accept=".svg,.pdf,.dxf,.ai" style="display:none"
        @change="uploadFile($event.target.files[0]); $event.target.value=''" />
    </div>
    <div class="field">
      <label>Recently Used Patterns</label>
      <div class="list">
        <div v-if="!recentPatterns.length" class="meta">No patterns yet.</div>
        <div v-for="p in recentPatterns" :key="p.id" class="list-item">
          <div><div>{{ p.name }}</div><div class="meta">{{ p.format.toUpperCase() }} · {{ (p.size/1024).toFixed(0) }} KB</div></div>
          <div class="actions">
            <button @click="selectPattern(p.id)">Load</button>
            <button class="danger" @click="deletePattern(p.id)">✕</button>
          </div>
        </div>
      </div>
    </div>
    <div v-if="pattern" class="field">
      <label>Pattern Information</label>
      <div class="info-box">
        <div><span class="k">Name:</span> {{ pattern.name }}</div>
        <div><span class="k">Size:</span> {{ (pattern.size/1024).toFixed(1) }} KB</div>
        <div><span class="k">Dimensions:</span> {{ pattern.width }}×{{ pattern.height }}px</div>
        <div><span class="k">Format:</span> {{ pattern.format.toUpperCase() }}</div>
      </div>
    </div>
  </overlay-window>

  <!-- ===== Overlay: Calibration ===== -->
  <overlay-window v-if="overlays.calibrate" :ref="setRef('calibrate')" id="calibrate" title="Calibration Settings" icon="⚙️"
    :initial="{x:420,y:70,w:340,h:470}" @close="toggle('calibrate')" @focus="focusOverlay">
    <div class="field">
      <label>Calibration Method</label>
      <div class="radio-list">
        <label><input type="radio" value="tape" v-model="calib.method"> Tape Measure (Physical)</label>
        <label><input type="radio" value="object" v-model="calib.method"> Known Object (e.g. A4 paper)</label>
        <label><input type="radio" value="manual" v-model="calib.method"> Manual Entry</label>
      </div>
    </div>
    <div class="field">
      <label>Projected Distance (px) / Actual Distance (cm)</label>
      <div class="row">
        <input type="number" step="1" min="1" v-model.number="calib.projected" />
        <input type="number" step="0.1" min="0.1" v-model.number="calib.actual" />
        <select v-model.number="calib.tolerance">
          <option :value="0.5">±0.5 mm</option>
          <option :value="0.2">±0.2 mm</option>
          <option :value="1">±1 mm</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Calibration Process</label>
      <ol class="steps">
        <li>Place tape measure on table</li>
        <li>Measure the projected pattern distance in pixels and enter it above</li>
        <li>Enter the real distance above</li>
        <li>Click Calibrate until distances match</li>
      </ol>
    </div>
    <div class="field" v-if="pattern">
      <label>Current Calibration</label>
      <div class="info-box">
        <div><span class="k">Pattern Scale:</span> {{ scale.toFixed(3) }}x</div>
        <div><span class="k">Projected distance:</span> {{ calib.projected }}px</div>
        <div><span class="k">Accuracy:</span> ±{{ pattern.calibration.accuracy }}mm</div>
      </div>
    </div>
    <div class="row">
      <button class="primary" @click="runCalibration" :disabled="!pattern || locked">Calibrate</button>
      <button @click="resetCalibration" :disabled="!pattern || locked">Reset</button>
      <button :class="{active: locked}" @click="toggleLock()" :disabled="!pattern">{{ locked?'Unlock':'Lock' }}</button>
    </div>
  </overlay-window>

  <!-- ===== Overlay: Controls ===== -->
  <overlay-window v-if="overlays.controls" :ref="setRef('controls')" id="controls" title="Pattern Controls" icon="✏️"
    :initial="{x:60,y:160,w:330,h:460}" @close="toggle('controls')" @focus="focusOverlay">
    <div class="field">
      <label>Zoom — {{ pattern ? (pattern.scale*100).toFixed(1) : 100 }}%</label>
      <div class="row">
        <input type="range" min="5" max="400" step="0.1" :value="pattern?pattern.scale*100:100"
          :disabled="!pattern || locked" @input="setScale($event.target.value/100)" />
        <input type="number" step="0.1" class="num-input" :value="pattern?+(pattern.scale*100).toFixed(2):100"
          :disabled="!pattern || locked" @change="setScale($event.target.value/100)" />
      </div>
      <div class="row">
        <button @click="zoom(0.05)" :disabled="!pattern||locked">+</button>
        <button @click="zoom(-0.05)" :disabled="!pattern||locked">−</button>
        <button @click="resetAll" :disabled="!pattern">Reset</button>
        <button @click="fitToScreen" :disabled="!pattern">Fit</button>
      </div>
    </div>
    <div class="field">
      <label>Rotation — {{ pattern ? pattern.rotation.toFixed(1) : 0 }}°</label>
      <div class="row">
        <input type="range" min="-180" max="180" step="0.1" :value="pattern?pattern.rotation:0"
          :disabled="!pattern" @input="setRotation($event.target.value)" />
        <input type="number" step="0.1" class="num-input" :value="pattern?+pattern.rotation.toFixed(1):0"
          :disabled="!pattern" @change="setRotation($event.target.value)" />
      </div>
      <div class="row">
        <button @click="rotate(-15)" :disabled="!pattern">↺ Left</button>
        <button @click="rotate(15)" :disabled="!pattern">↻ Right</button>
      </div>
    </div>
    <div class="field">
      <label>Position</label>
      <div class="row"><span style="flex:0 0 18px">X</span>
        <input type="range" min="-800" max="800" :value="pattern?pattern.position.x:0"
          :disabled="!pattern" @input="setPos('x',$event.target.value)" />
        <input type="number" step="1" class="num-input" :value="pattern?+pattern.position.x.toFixed(1):0"
          :disabled="!pattern" @change="setPos('x',$event.target.value)" /></div>
      <div class="row"><span style="flex:0 0 18px">Y</span>
        <input type="range" min="-800" max="800" :value="pattern?pattern.position.y:0"
          :disabled="!pattern" @input="setPos('y',$event.target.value)" />
        <input type="number" step="1" class="num-input" :value="pattern?+pattern.position.y.toFixed(1):0"
          :disabled="!pattern" @change="setPos('y',$event.target.value)" /></div>
      <div class="row">
        <button @click="centerPattern" :disabled="!pattern">Center</button>
      </div>
    </div>
    <div class="field">
      <label>Display</label>
      <div class="toggle-row"><span>Grid overlay</span><input type="checkbox" v-model="view.grid"></div>
      <div class="toggle-row"><span>🔒 Lock calibration</span>
        <input type="checkbox" :checked="locked" @change="toggleLock($event.target.checked)"></div>
    </div>
  </overlay-window>

  <!-- ===== Overlay: Regions ===== -->
  <overlay-window v-if="overlays.regions" :ref="setRef('regions')" id="regions" title="Regions" icon="🔲"
    :initial="{x:780,y:160,w:340,h:430}" @close="toggle('regions')" @focus="focusOverlay">
    <div class="field">
      <label>Pin a rectangle to the pattern — e.g. a printed calibration square or
        small caption text — and keep it visible as its own zoomable overlay,
        independent of the main view's pan/zoom/rotation.</label>
      <button class="primary" :class="{active: regionDrawMode}" @click="toggleRegionDrawMode" :disabled="!pattern">
        {{ regionDrawMode ? '✕ Cancel Drawing' : '🔲 Draw New Region' }}
      </button>
    </div>
    <div class="field">
      <label>Defined Regions</label>
      <div class="list">
        <div v-if="!regions.length" class="meta">No regions yet.</div>
        <div v-for="r in regions" :key="r.id" class="list-item">
          <div style="flex:1;min-width:0">
            <input type="text" class="region-name" :value="r.name" @change="renameRegion(r.id, $event.target.value)" />
            <div class="meta">{{ Math.round(r.width) }}×{{ Math.round(r.height) }}px @ ({{ Math.round(r.x) }},{{ Math.round(r.y) }})</div>
          </div>
          <div class="actions">
            <button :class="{active: regionOpen[r.id]}" @click="toggleRegionOpen(r.id)">{{ regionOpen[r.id] ? '🔍 Hide' : '🔍 Show' }}</button>
            <button class="danger" @click="deleteRegion(r.id)">✕</button>
          </div>
        </div>
      </div>
    </div>
  </overlay-window>

  <!-- ===== Region magnifier overlays (one per shown region) ===== -->
  <overlay-window v-for="r in regions.filter(rr => regionOpen[rr.id])" :key="'mag-'+r.id"
    :ref="setRef('region-'+r.id)" :id="'region-'+r.id" :title="r.name" icon="🔍"
    :initial="{x:80,y:520,w:260,h:240}" @close="toggleRegionOpen(r.id)" @focus="focusOverlay">
    <div class="magnifier-body">
      <div class="region-viewport" :ref="(el) => setRegionViewportEl(r.id, el)" @wheel="onRegionWheel(r, $event)">
        <div :style="regionContentStyle(r)">
          <div v-if="patternMarkup" v-html="patternMarkup"></div>
          <img v-else-if="patternImgUrl" :src="patternImgUrl" :width="pattern.width" :height="pattern.height" alt="region" draggable="false" />
        </div>
      </div>
      <div class="region-zoom-controls">
        <button @click="zoomRegion(r, 0.8)">−</button>
        <span>{{ (r.zoom*100).toFixed(0) }}%</span>
        <button @click="zoomRegion(r, 1.25)">+</button>
        <button @click="r.zoom=1; pushRegions()">Reset</button>
      </div>
    </div>
  </overlay-window>

  <!-- ===== Overlay: Project ===== -->
  <overlay-window v-if="overlays.project" :ref="setRef('project')" id="project" title="Project Management" icon="💾"
    :initial="{x:420,y:160,w:340,h:470}" @close="toggle('project')" @focus="focusOverlay">
    <div class="field">
      <label>Project Name</label>
      <input type="text" v-model="projectForm.name" placeholder="dress_v1" />
    </div>
    <div class="field">
      <label>Description</label>
      <input type="text" v-model="projectForm.description" placeholder="Evening dress" />
    </div>
    <div class="field">
      <label>Tags (comma separated)</label>
      <input type="text" v-model="projectForm.tags" placeholder="dress, evening, v1" />
    </div>
    <div class="row">
      <button class="primary" @click="saveProject" :disabled="!pattern">💾 Save Project</button>
    </div>
    <div class="field" style="margin-top:.8rem">
      <label>Saved Projects</label>
      <div class="list">
        <div v-if="!projects.length" class="meta">No saved projects.</div>
        <div v-for="p in projects" :key="p.id" class="list-item">
          <div><div>{{ p.name }}</div><div class="meta">{{ p.modified.slice(0,10) }}</div></div>
          <div class="actions">
            <button @click="openProject(p.id)">Load</button>
            <button class="danger" @click="deleteProject(p.id)">✕</button>
          </div>
        </div>
      </div>
    </div>
    <div class="field">
      <label>Export</label>
      <div class="row">
        <button @click="exportAs('pdf')" :disabled="!pattern">📥 PDF</button>
        <button @click="exportAs('svg')" :disabled="!pattern">📥 SVG</button>
        <button @click="exportAs('png')" :disabled="!pattern">📥 Image</button>
      </div>
    </div>
  </overlay-window>

  <!-- ===== Overlay: Person ===== -->
  <overlay-window v-if="overlays.persons" :ref="setRef('persons')" id="persons" title="Person" icon="👤"
    :initial="{x:780,y:160,w:340,h:540}" @close="toggle('persons')" @focus="focusOverlay">
    <div class="field">
      <label>Name</label>
      <input type="text" v-model="personForm.name" placeholder="e.g. Jonas" />
    </div>
    <div class="field">
      <label>Body Measurements (cm)</label>
      <div class="row">
        <input type="number" min="0" step="0.5" v-model.number="personForm.height" placeholder="Height" />
        <input type="number" min="0" step="0.5" v-model.number="personForm.chest" placeholder="Chest" />
      </div>
      <div class="row">
        <input type="number" min="0" step="0.5" v-model.number="personForm.waist" placeholder="Waist" />
        <input type="number" min="0" step="0.5" v-model.number="personForm.hip" placeholder="Hip" />
      </div>
      <div class="row">
        <input type="number" min="0" step="0.5" v-model.number="personForm.shoulder" placeholder="Shoulder" />
        <input type="number" min="0" step="0.5" v-model.number="personForm.sleeve" placeholder="Sleeve" />
      </div>
      <div class="row">
        <input type="number" min="0" step="0.5" v-model.number="personForm.inseam" placeholder="Inseam" />
      </div>
    </div>
    <div class="field">
      <label>Notes</label>
      <input type="text" v-model="personForm.notes" placeholder="optional" />
    </div>
    <div class="row">
      <button class="primary" @click="savePersonForm">{{ personForm.id ? '💾 Update Person' : '➕ Add Person' }}</button>
      <button v-if="personForm.id" @click="resetPersonForm">Cancel</button>
    </div>
    <div class="field" style="margin-top:.8rem">
      <label>Saved People</label>
      <div class="list">
        <div v-if="!persons.length" class="meta">No people saved yet.</div>
        <div v-for="p in persons" :key="p.id" class="list-item">
          <div>
            <div>{{ p.name }} <span v-if="activePersonId===p.id" class="meta">(active)</span></div>
            <div class="meta">
              <span v-if="p.measurements.chest">Chest {{ p.measurements.chest }}cm </span>
              <span v-if="p.measurements.waist">Waist {{ p.measurements.waist }}cm </span>
              <span v-if="p.measurements.hip">Hip {{ p.measurements.hip }}cm</span>
            </div>
          </div>
          <div class="actions">
            <button :class="{active: activePersonId===p.id}" @click="setActivePerson(p.id)">Use</button>
            <button @click="editPerson(p)">Edit</button>
            <button class="danger" @click="deletePersonRecord(p.id)">✕</button>
          </div>
        </div>
      </div>
    </div>
  </overlay-window>

  <!-- ===== Overlay: Size Guide ===== -->
  <overlay-window v-if="overlays.sizeGuide" :ref="setRef('sizeGuide')" id="sizeGuide" title="Size Guide" icon="📏"
    :initial="{x:420,y:300,w:380,h:520}" @close="toggle('sizeGuide')" @focus="focusOverlay">
    <div class="field">
      <label>Chart</label>
      <div class="row">
        <select v-model="sizeGuideCategory">
          <option value="women">{{ sizeChart.women.label }}</option>
          <option value="men">{{ sizeChart.men.label }}</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Your {{ activeSizeChart.measurement }} measurement (cm)</label>
      <div class="row">
        <input type="number" min="0" step="0.5" v-model.number="sizeGuideValue" placeholder="e.g. 100" />
        <span v-if="activePerson" class="meta">from {{ activePerson.name }}</span>
      </div>
    </div>
    <div class="field" v-if="sizeGuideValue">
      <label>Result</label>
      <div class="info-box">
        <div v-if="sizeGuideMatch.exact">Pick <strong>{{ sizeGuideMatch.exact.label }}</strong></div>
        <div v-else-if="sizeGuideMatch.below || sizeGuideMatch.above">
          Between sizes — no exact match.
          <div v-if="sizeGuideMatch.below"><span class="k">Closest below:</span> {{ sizeGuideMatch.below.label }}</div>
          <div v-if="sizeGuideMatch.above"><span class="k">Closest above:</span> {{ sizeGuideMatch.above.label }}</div>
          <div>Consider sizing up if between, or grading between sizes.</div>
        </div>
        <div v-else>No matching size in this chart.</div>
      </div>
    </div>
    <div class="field">
      <label>Chart (cm) — edit to match your pattern's own size table</label>
      <div class="list">
        <div v-for="(r, i) in activeSizeChart.rows" :key="i" class="list-item size-row"
          :class="{match: sizeGuideMatch.exact===r}">
          <div style="flex:1;min-width:0">
            <input type="text" class="region-name" :value="r.label" @change="r.label=$event.target.value; persistSizeChart()" />
            <div class="row">
              <input type="number" class="num-input" :value="r.min" @change="r.min=+$event.target.value; persistSizeChart()" />
              <span class="meta">– cm –</span>
              <input type="number" class="num-input" :value="r.max" @change="r.max=+$event.target.value; persistSizeChart()" />
            </div>
          </div>
          <div class="actions">
            <button class="danger" @click="deleteSizeRow(i)">✕</button>
          </div>
        </div>
      </div>
    </div>
    <div class="row">
      <button @click="addSizeRow">➕ Add Row</button>
      <button @click="resetSizeChart">Reset to Default</button>
    </div>
  </overlay-window>

  <!-- ===== Overlay: Logs ===== -->
  <overlay-window v-if="overlays.logs" :ref="setRef('logs')" id="logs" title="Server Logs" icon="📊"
    :initial="{x:780,y:70,w:380,h:360}" @close="toggle('logs')" @focus="focusOverlay">
    <div class="log-controls">
      <button @click="logsPaused=!logsPaused">{{ logsPaused?'▶ Resume':'⏸ Pause' }}</button>
      <button @click="clearLogs">🗑 Clear</button>
      <button @click="exportLogs">📥 Export</button>
      <span class="meta" style="align-self:center">{{ wsConnected?'🔴 Live':'offline' }}</span>
    </div>
    <div class="log-feed">
      <div v-for="(l,i) in logs" :key="i" class="log-line" :class="l.level">{{ fmtLog(l) }}</div>
    </div>
  </overlay-window>

</div>

<div v-if="toast.show" class="toast" :class="toast.kind">{{ toast.msg }}</div>
`;

/* ---------------- Main app ---------------- */
createApp({
  components: { OverlayWindow },
  setup() {
    /* ---- state ---- */
    const pattern = ref(null);          // current PatternData
    const patternMarkup = ref("");      // inline SVG markup
    const patternImgUrl = ref("");      // for raster/pdf fallback
    const recentPatterns = ref([]);
    const projects = ref([]);
    const logs = ref([]);
    const wsConnected = ref(false);
    const logsPaused = ref(false);
    const dragOver = ref(false);
    const toast = reactive({ show: false, msg: "", kind: "" });

    const view = reactive({ grid: false, gridSize: 10, showLabels: true });
    const calib = reactive({ method: "tape", reference: 10, tolerance: 0.5, actual: 10, projected: 100 });
    const projectForm = reactive({ name: "", description: "", tags: "" });

    // Point on the pattern (local, unscaled/unrotated coords relative to its center)
    // that stays fixed on screen while zooming/rotating.
    const zoomAnchor = ref(null);

    // Regions of interest pinned to the pattern's own (unscaled, unrotated) coordinate
    // space, e.g. a calibration square or caption that should stay visible/legible
    // regardless of the main view's pan/zoom/rotation.
    const regions = ref([]);
    const regionDrawMode = ref(false);
    const drawingRect = ref(null); // {x1,y1,x2,y2} in stage-relative screen px while dragging
    const regionOpen = reactive({}); // regionId -> bool, persisted to localStorage
    const regionViewportSize = reactive({}); // regionId -> {w,h} of its magnifier viewport
    const regionObservers = {}; // regionId -> ResizeObserver (not reactive)

    const persons = ref([]);
    const personForm = reactive({
      id: null, name: "", height: "", chest: "", waist: "", hip: "", inseam: "", shoulder: "", sleeve: "", notes: "",
    });

    /* ---- size guide: cross-reference a body measurement against EU/US size charts ---- */
    const SIZE_CHART_DEFAULTS = {
      women: {
        label: "Women's Tops (Bust)",
        measurement: "chest",
        rows: [
          { label: "US 0 / EU 32", min: 78, max: 80 },
          { label: "US 2 / EU 34", min: 81, max: 83 },
          { label: "US 4 / EU 36", min: 84, max: 86 },
          { label: "US 6 / EU 38", min: 87, max: 89 },
          { label: "US 8 / EU 40", min: 90, max: 93 },
          { label: "US 10 / EU 42", min: 94, max: 97 },
          { label: "US 12 / EU 44", min: 98, max: 101 },
          { label: "US 14 / EU 46", min: 102, max: 105 },
          { label: "US 16 / EU 48", min: 106, max: 110 },
          { label: "US 18 / EU 50", min: 111, max: 115 },
          { label: "US 20 / EU 52", min: 116, max: 120 },
        ],
      },
      men: {
        label: "Men's Tops (Chest)",
        measurement: "chest",
        rows: [
          { label: "US 36 / EU 46", min: 91, max: 94 },
          { label: "US 38 / EU 48", min: 95, max: 98 },
          { label: "US 40 / EU 50", min: 99, max: 102 },
          { label: "US 42 / EU 52", min: 103, max: 106 },
          { label: "US 44 / EU 54", min: 107, max: 111 },
          { label: "US 46 / EU 56", min: 112, max: 116 },
        ],
      },
    };
    const sizeGuideCategory = ref("women");
    const sizeGuideValue = ref("");
    function loadSizeChart(cat) {
      try {
        const saved = JSON.parse(localStorage.getItem(`sizeChart:${cat}`) || "null");
        if (saved && Array.isArray(saved.rows)) return saved;
      } catch (e) { /* fall back to defaults */ }
      return JSON.parse(JSON.stringify(SIZE_CHART_DEFAULTS[cat]));
    }
    const sizeChart = reactive({
      women: loadSizeChart("women"),
      men: loadSizeChart("men"),
    });
    function persistSizeChart() {
      localStorage.setItem(`sizeChart:${sizeGuideCategory.value}`, JSON.stringify(sizeChart[sizeGuideCategory.value]));
    }
    function resetSizeChart() {
      sizeChart[sizeGuideCategory.value] = JSON.parse(JSON.stringify(SIZE_CHART_DEFAULTS[sizeGuideCategory.value]));
      persistSizeChart();
    }
    function addSizeRow() {
      sizeChart[sizeGuideCategory.value].rows.push({ label: "New size", min: 0, max: 0 });
      persistSizeChart();
    }
    function deleteSizeRow(i) {
      sizeChart[sizeGuideCategory.value].rows.splice(i, 1);
      persistSizeChart();
    }
    const activeSizeChart = computed(() => sizeChart[sizeGuideCategory.value]);
    const sizeGuideMatch = computed(() => {
      const v = +sizeGuideValue.value;
      const rows = activeSizeChart.value.rows;
      if (!v || !rows.length) return { exact: null, below: null, above: null };
      const exact = rows.find((r) => v >= r.min && v <= r.max);
      if (exact) return { exact, below: null, above: null };
      const sorted = [...rows].sort((a, b) => a.min - b.min);
      const below = [...sorted].reverse().find((r) => r.max < v) || null;
      const above = sorted.find((r) => r.min > v) || null;
      return { exact: null, below, above };
    });
    const overlays = reactive({
      upload: false, calibrate: false, controls: false, project: false, logs: false,
      regions: false, persons: false, sizeGuide: false,
    });
    let zCounter = 20;
    const focusOverlay = (id) => {
      zCounter += 1;
      const el = overlayRefs[id];
      if (el && el.setZ) el.setZ(zCounter);
    };
    const overlayRefs = {};
    const setRef = (id) => (el) => { if (el) overlayRefs[id] = el; };
    const toggle = (id) => { overlays[id] = !overlays[id]; if (overlays[id]) focusOverlay(id); };

    /* ---- derived ---- */
    const scale = computed(() => pattern.value ? pattern.value.scale : 1);
    const locked = computed(() => pattern.value ? pattern.value.calibration.locked : false);
    const calibrated = computed(() => pattern.value && pattern.value.calibration.scaleFactor !== 1);
    const hostStyle = computed(() => {
      const p = pattern.value;
      if (!p) return {};
      return {
        transform: `translate(${p.position.x}px, ${p.position.y}px) ` +
          `scale(${p.scale}) rotate(${p.rotation}deg)`,
        width: p.width + "px",
        height: p.height + "px",
      };
    });
    const gridStyle = computed(() => {
      const s = view.gridSize;
      return {
        backgroundImage:
          `linear-gradient(#2a3a5e 1px, transparent 1px),` +
          `linear-gradient(90deg, #2a3a5e 1px, transparent 1px)`,
        backgroundSize: `${s * 4}px ${s * 4}px`,
      };
    });

    /* ---- zoom anchor: a point on the pattern that stays fixed on screen while zooming ---- */
    function stageCenter() {
      const el = document.querySelector(".stage");
      const r = el ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
      return { left: r.left, top: r.top, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    function localFromClientPoint(clientX, clientY) {
      const p = pattern.value;
      const c = stageCenter();
      const dx = clientX - c.x - p.position.x;
      const dy = clientY - c.y - p.position.y;
      const rad = -p.rotation * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      return { x: (dx * cos - dy * sin) / p.scale, y: (dx * sin + dy * cos) / p.scale };
    }
    function clientPointFromLocal(L) {
      const p = pattern.value;
      const c = stageCenter();
      const rad = p.rotation * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      return {
        x: c.x + p.position.x + (L.x * cos - L.y * sin) * p.scale,
        y: c.y + p.position.y + (L.x * sin + L.y * cos) * p.scale,
      };
    }
    const anchorMarkerStyle = computed(() => {
      if (!zoomAnchor.value || !pattern.value) return { display: "none" };
      const c = stageCenter();
      const pt = clientPointFromLocal(zoomAnchor.value);
      return { left: (pt.x - c.left) + "px", top: (pt.y - c.top) + "px" };
    });
    /** Change scale while keeping the zoom anchor (if set) fixed on screen. */
    function applyScale(newScale) {
      if (!pattern.value || locked.value) return;
      const oldScale = pattern.value.scale;
      const clamped = Math.max(0.05, +newScale.toFixed(4));
      if (zoomAnchor.value) {
        const L = zoomAnchor.value;
        const rad = pattern.value.rotation * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const rx = L.x * cos - L.y * sin;
        const ry = L.x * sin + L.y * cos;
        pattern.value.position.x += rx * (oldScale - clamped);
        pattern.value.position.y += ry * (oldScale - clamped);
      }
      pattern.value.scale = clamped;
      pushTransform();
    }

    /* ---- regions: rectangles pinned to the pattern's own (top-left origin) coordinate space ---- */
    function topLeftFromClientPoint(clientX, clientY) {
      const p = pattern.value;
      const c = localFromClientPoint(clientX, clientY);
      return { x: c.x + p.width / 2, y: c.y + p.height / 2 };
    }
    function regionScreenPoints(region) {
      const p = pattern.value;
      const c = stageCenter();
      const corners = [
        { x: region.x, y: region.y },
        { x: region.x + region.width, y: region.y },
        { x: region.x + region.width, y: region.y + region.height },
        { x: region.x, y: region.y + region.height },
      ];
      return corners.map((pt) => {
        const local = { x: pt.x - p.width / 2, y: pt.y - p.height / 2 };
        const screen = clientPointFromLocal(local);
        return `${screen.x - c.left},${screen.y - c.top}`;
      }).join(" ");
    }

    /* ---- toast ---- */
    let toastTimer;
    function notify(msg, kind = "") {
      toast.msg = msg; toast.kind = kind; toast.show = true;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (toast.show = false), 3000);
    }

    /* ---- patterns ---- */
    async function loadRecent() {
      try { recentPatterns.value = await api.get("/api/pattern/list"); } catch (e) { /* */ }
    }
    async function renderPattern(p) {
      pattern.value = p;
      patternMarkup.value = "";
      patternImgUrl.value = "";
      zoomAnchor.value = null;
      regionDrawMode.value = false;
      drawingRect.value = null;
      regions.value = p.regions || [];
      for (const r of regions.value) {
        regionOpen[r.id] = localStorage.getItem(`regionOpen:${r.id}`) === "1";
      }
      if (p.format === "svg") {
        const res = await fetch(`/api/pattern/${p.id}/file`);
        let svg = await res.text();
        // ensure explicit size so transforms are predictable
        patternMarkup.value = svg;
        await nextTick();
      } else {
        patternImgUrl.value = `/api/pattern/${p.id}/file`;
      }
      // sync calibration form
      calib.reference = p.calibration.referenceDistance;
    }
    async function selectPattern(id) {
      try {
        const p = await api.get(`/api/pattern/${id}`);
        await renderPattern(p);
        notify(`Loaded ${p.name}`, "success");
      } catch (e) { notify(e.message, "error"); }
    }
    async function uploadFile(file) {
      if (!file) return;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", file.name);
      try {
        const res = await fetch("/api/pattern/upload", { method: "POST", body: fd });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Upload failed");
        await loadRecent();
        await renderPattern(body);
        notify(`Uploaded ${body.name}`, "success");
      } catch (e) { notify(e.message, "error"); }
    }
    async function deletePattern(id) {
      try {
        await api.del(`/api/pattern/${id}`);
        if (pattern.value && pattern.value.id === id) { pattern.value = null; patternMarkup.value = ""; }
        await loadRecent();
      } catch (e) { notify(e.message, "error"); }
    }

    /* ---- transforms ---- */
    let saveTimer;
    function pushTransform() {
      if (!pattern.value) return;
      clearTimeout(saveTimer);
      const p = pattern.value;
      saveTimer = setTimeout(() => {
        api.put(`/api/pattern/${p.id}`, {
          scale: p.scale, rotation: p.rotation, position: p.position,
        }).catch(() => {});
      }, 250);
    }
    let regionSaveTimer;
    function pushRegions() {
      if (!pattern.value) return;
      clearTimeout(regionSaveTimer);
      const p = pattern.value;
      regionSaveTimer = setTimeout(() => {
        api.put(`/api/pattern/${p.id}`, { regions: regions.value }).catch(() => {});
      }, 250);
    }
    function toggleRegionDrawMode() {
      regionDrawMode.value = !regionDrawMode.value;
      drawingRect.value = null;
    }
    function startRegionDraw(e) {
      if (!pattern.value) return;
      e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      const c = stageCenter();
      const startX = t.clientX, startY = t.clientY;
      drawingRect.value = { x1: startX - c.left, y1: startY - c.top, x2: startX - c.left, y2: startY - c.top };
      const move = (ev) => {
        const mt = ev.touches ? ev.touches[0] : ev;
        drawingRect.value = { x1: startX - c.left, y1: startY - c.top, x2: mt.clientX - c.left, y2: mt.clientY - c.top };
      };
      const up = (ev) => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("touchmove", move);
        window.removeEventListener("touchend", up);
        const mt = ev.changedTouches ? ev.changedTouches[0] : ev;
        drawingRect.value = null;
        if (Math.hypot(mt.clientX - startX, mt.clientY - startY) < 6) return; // ignore accidental clicks
        const a = topLeftFromClientPoint(startX, startY);
        const b = topLeftFromClientPoint(mt.clientX, mt.clientY);
        const width = Math.abs(b.x - a.x), height = Math.abs(b.y - a.y);
        if (width < 4 || height < 4) return; // too thin to be a usable region
        const region = {
          id: `region_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: `Region ${regions.value.length + 1}`,
          x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
          width, height,
          zoom: 1,
        };
        regions.value = [...regions.value, region];
        pushRegions();
        notify(`Added ${region.name}`, "success");
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("touchend", up);
    }
    const drawingRectStyle = computed(() => {
      const r = drawingRect.value;
      if (!r) return { display: "none" };
      return {
        left: Math.min(r.x1, r.x2) + "px", top: Math.min(r.y1, r.y2) + "px",
        width: Math.abs(r.x2 - r.x1) + "px", height: Math.abs(r.y2 - r.y1) + "px",
      };
    });
    function renameRegion(id, name) {
      const r = regions.value.find((r) => r.id === id);
      if (!r) return;
      r.name = name;
      pushRegions();
    }
    function deleteRegion(id) {
      regions.value = regions.value.filter((r) => r.id !== id);
      delete regionOpen[id];
      localStorage.removeItem(`regionOpen:${id}`);
      pushRegions();
    }
    function toggleRegionOpen(id) {
      regionOpen[id] = !regionOpen[id];
      localStorage.setItem(`regionOpen:${id}`, regionOpen[id] ? "1" : "0");
    }
    function zoomRegion(region, factor) {
      region.zoom = Math.max(0.25, Math.min(12, +(region.zoom * factor).toFixed(3)));
      pushRegions();
    }
    function onRegionWheel(region, e) {
      e.preventDefault();
      zoomRegion(region, Math.exp(-e.deltaY * 0.0015));
    }
    /** Track the magnifier viewport's size so its content can be scaled/cropped to fit. */
    function setRegionViewportEl(id, el) {
      if (!el || regionObservers[id]) return;
      regionViewportSize[id] = { w: el.clientWidth, h: el.clientHeight };
      const ro = new ResizeObserver((entries) => {
        const r = entries[0].contentRect;
        regionViewportSize[id] = { w: r.width, h: r.height };
      });
      ro.observe(el);
      regionObservers[id] = ro;
    }
    /** Crop+zoom the full pattern content so just `region` fills its magnifier viewport. */
    function regionContentStyle(region) {
      const p = pattern.value;
      const size = regionViewportSize[region.id] || { w: 200, h: 200 };
      if (!p || !region.width || !region.height) return {};
      const fit = Math.min(size.w / region.width, size.h / region.height) || 1;
      const s = fit * (region.zoom || 1);
      const tx = size.w / 2 - (region.x + region.width / 2) * s;
      const ty = size.h / 2 - (region.y + region.height / 2) * s;
      return {
        position: "absolute", left: "0", top: "0",
        width: p.width + "px", height: p.height + "px",
        transformOrigin: "0 0",
        transform: `translate(${tx}px, ${ty}px) scale(${s})`,
      };
    }

    function setScale(v) { applyScale(+v); }
    function zoom(delta) {
      if (!pattern.value) return;
      applyScale(pattern.value.scale + delta);
    }
    function setRotation(v) { if (!pattern.value) return; pattern.value.rotation = +v; pushTransform(); }
    function rotate(delta) { if (!pattern.value) return; pattern.value.rotation += delta; pushTransform(); }
    function setPos(axis, v) { if (!pattern.value) return; pattern.value.position[axis] = +v; pushTransform(); }
    function centerPattern() {
      if (!pattern.value) return;
      zoomAnchor.value = null;
      pattern.value.position = { x: 0, y: 0 };
      pushTransform();
    }
    function resetAll() {
      if (!pattern.value) return;
      zoomAnchor.value = null;
      pattern.value.scale = pattern.value.calibration.scaleFactor || 1;
      pattern.value.rotation = 0;
      pattern.value.position = { x: 0, y: 0 };
      pushTransform();
    }
    function fitToScreen() {
      if (!pattern.value) return;
      const ws = document.querySelector(".workspace");
      if (!ws) return;
      zoomAnchor.value = null;
      const sx = (ws.clientWidth * 0.9) / pattern.value.width;
      const sy = (ws.clientHeight * 0.9) / pattern.value.height;
      pattern.value.scale = +Math.min(sx, sy).toFixed(3);
      pattern.value.position = { x: 0, y: 0 };
      pushTransform();
    }

    /* ---- calibration ---- */
    async function runCalibration() {
      if (!pattern.value) { notify("Load a pattern first", "error"); return; }
      if (locked.value) { notify("Calibration is locked", "error"); return; }
      const projectedDistance = +calib.projected;
      const actualDistance = +calib.actual;
      if (projectedDistance <= 0 || actualDistance <= 0) {
        notify("Enter a valid projected and actual distance", "error"); return;
      }
      try {
        const { pattern: p, status } = await api.post(
          `/api/pattern/${pattern.value.id}/calibrate`,
          { projectedDistance, actualDistance },
        );
        pattern.value = p;
        notify(`Calibrated → ${p.scale.toFixed(3)}x (±${status.accuracy}mm)`, "success");
      } catch (e) { notify(e.message, "error"); }
    }
    async function applyReference() {
      if (!pattern.value || locked.value) return;
      try {
        await api.post(`/api/pattern/${pattern.value.id}/scale`, {
          scale: pattern.value.scale, referenceDistance: +calib.reference,
        });
        pattern.value.calibration.referenceDistance = +calib.reference;
      } catch (e) { notify(e.message, "error"); }
    }
    async function resetCalibration() {
      if (!pattern.value || locked.value) return;
      try {
        const p = await api.post(`/api/pattern/${pattern.value.id}/scale`, { scale: 1 });
        pattern.value = p;
        notify("Calibration reset");
      } catch (e) { notify(e.message, "error"); }
    }
    async function toggleLock(force) {
      if (!pattern.value) { notify("Load a pattern first", "error"); return; }
      const next = force !== undefined ? force : !locked.value;
      if (!next && locked.value && !confirm("Unlock calibration?")) return;
      try {
        const p = await api.post(`/api/pattern/${pattern.value.id}/lock`, { locked: next });
        pattern.value = p;
        notify(next ? "🔒 Calibration locked" : "🔓 Calibration unlocked", next ? "success" : "");
      } catch (e) { notify(e.message, "error"); }
    }

    /* ---- pattern drag (translate by drag-and-drop); a plain click sets the zoom anchor ---- */
    function startPatternDrag(e) {
      if (!pattern.value) return;
      e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      const startX = t.clientX, startY = t.clientY;
      const origin = { x: pattern.value.position.x, y: pattern.value.position.y };
      let moved = false;
      const move = (ev) => {
        const mt = ev.touches ? ev.touches[0] : ev;
        if (!moved && Math.hypot(mt.clientX - startX, mt.clientY - startY) < 3) return;
        moved = true;
        pattern.value.position.x = origin.x + (mt.clientX - startX);
        pattern.value.position.y = origin.y + (mt.clientY - startY);
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("touchmove", move);
        window.removeEventListener("touchend", up);
        if (moved) {
          pushTransform();
        } else {
          zoomAnchor.value = localFromClientPoint(startX, startY);
        }
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("touchend", up);
    }

    /* ---- shift + scrollwheel zoom, ctrl + scrollwheel rotate ---- */
    function onStageWheel(e) {
      if (!pattern.value) return;
      if (e.ctrlKey) {
        // also fires for trackpad pinch-zoom gestures — prevent the page from zooming
        e.preventDefault();
        pattern.value.rotation = +(pattern.value.rotation + e.deltaY * 0.03).toFixed(2);
        pushTransform();
      } else if (e.shiftKey) {
        if (locked.value) return;
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0003);
        applyScale(pattern.value.scale * factor);
      }
    }

    /* ---- persons ---- */
    const MEASUREMENT_FIELDS = ["height", "chest", "waist", "hip", "inseam", "shoulder", "sleeve"];
    async function loadPersons() {
      try { persons.value = await api.get("/api/person/list"); } catch (e) { /* */ }
    }
    function resetPersonForm() {
      personForm.id = null;
      personForm.name = "";
      personForm.notes = "";
      for (const f of MEASUREMENT_FIELDS) personForm[f] = "";
    }
    function editPerson(p) {
      personForm.id = p.id;
      personForm.name = p.name;
      personForm.notes = p.notes || "";
      for (const f of MEASUREMENT_FIELDS) personForm[f] = p.measurements?.[f] ?? "";
    }
    async function savePersonForm() {
      if (!personForm.name.trim()) { notify("Enter a name", "error"); return; }
      const measurements = {};
      for (const f of MEASUREMENT_FIELDS) {
        if (personForm[f] !== "" && personForm[f] != null) measurements[f] = +personForm[f];
      }
      const payload = { name: personForm.name.trim(), notes: personForm.notes, measurements };
      try {
        const saved = personForm.id
          ? await api.put(`/api/person/${personForm.id}`, payload)
          : await api.post("/api/person", payload);
        await loadPersons();
        resetPersonForm();
        notify(`Saved ${saved.name}`, "success");
      } catch (e) { notify(e.message, "error"); }
    }
    async function deletePersonRecord(id) {
      try {
        await api.del(`/api/person/${id}`);
        if (personForm.id === id) resetPersonForm();
        if (activePersonId.value === id) activePersonId.value = null;
        await loadPersons();
      } catch (e) { notify(e.message, "error"); }
    }
    const activePersonId = ref(null);
    const activePerson = computed(() => persons.value.find((p) => p.id === activePersonId.value) || null);
    function setActivePerson(id) { activePersonId.value = activePersonId.value === id ? null : id; }
    watch(activePerson, (p) => {
      if (p && p.measurements && p.measurements[activeSizeChart.value.measurement] != null) {
        sizeGuideValue.value = p.measurements[activeSizeChart.value.measurement];
      }
    });

    /* ---- projects ---- */
    async function loadProjects() {
      try { projects.value = await api.get("/api/project/list"); } catch (e) { /* */ }
    }
    async function saveProject() {
      if (!pattern.value) { notify("Load a pattern first", "error"); return; }
      if (!projectForm.name) { notify("Enter a project name", "error"); return; }
      try {
        await api.post("/api/project/save", {
          name: projectForm.name,
          description: projectForm.description,
          tags: projectForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
          patternId: pattern.value.id,
          pattern: pattern.value,
          settings: { grid: { enabled: view.grid, size: view.gridSize }, overlay: { ...view } },
        });
        await loadProjects();
        notify(`Saved project ${projectForm.name}`, "success");
      } catch (e) { notify(e.message, "error"); }
    }
    async function openProject(id) {
      try {
        const proj = await api.get(`/api/project/${id}`);
        if (proj.settings && proj.settings.grid) {
          view.grid = !!proj.settings.grid.enabled;
          view.gridSize = proj.settings.grid.size || 10;
        }
        if (proj.pattern) {
          // refresh from server in case file metadata changed
          try { await renderPattern(await api.get(`/api/pattern/${proj.patternId}`)); }
          catch { await renderPattern(proj.pattern); }
        }
        projectForm.name = proj.name;
        projectForm.description = proj.description || "";
        projectForm.tags = (proj.tags || []).join(", ");
        notify(`Opened project ${proj.name}`, "success");
      } catch (e) { notify(e.message, "error"); }
    }
    async function deleteProject(id) {
      try { await api.del(`/api/project/${id}`); await loadProjects(); } catch (e) { notify(e.message, "error"); }
    }
    function exportAs(format) {
      if (!pattern.value) { notify("Load a pattern first", "error"); return; }
      const url = "/api/project/export";
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patternId: pattern.value.id, format }),
      }).then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || "Export failed");
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${pattern.value.name}.${format}`;
        a.click();
        URL.revokeObjectURL(a.href);
        notify(`Exported ${format.toUpperCase()}`, "success");
      }).catch((e) => notify(e.message, "error"));
    }

    /* ---- logs / websocket ---- */
    function connectWS() {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/`);
      ws.onopen = () => { wsConnected.value = true; };
      ws.onclose = () => { wsConnected.value = false; setTimeout(connectWS, 2000); };
      ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === "log" && !logsPaused.value) {
          logs.value.push(msg.payload);
          if (logs.value.length > 500) logs.value.shift();
          scrollLogs();
        }
        if (msg.type === "calibration" || msg.type === "pattern") {
          const p = msg.payload && msg.payload.pattern;
          if (p && pattern.value && p.id === pattern.value.id) {
            // reflect server-side changes (e.g. from another client)
            if (msg.payload.event !== "transformed") pattern.value = p;
          }
        }
      };
    }
    async function loadLogHistory() {
      try { logs.value = await api.get("/api/logs?limit=200"); scrollLogs(); } catch (e) { /* */ }
    }
    function scrollLogs() {
      nextTick(() => {
        const el = document.querySelector(".log-feed");
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
    async function clearLogs() { await api.post("/api/logs/clear", {}); logs.value = []; }
    function exportLogs() { window.open("/api/logs/export", "_blank"); }
    function fmtLog(e) {
      return `[${e.timestamp.replace("T", " ").slice(11, 19)}] ${e.level}: ${e.message}`;
    }

    /* ---- keyboard ---- */
    function onKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "+" || e.key === "=") zoom(0.05);
      else if (e.key === "-") zoom(-0.05);
      else if (e.key.toLowerCase() === "g") view.grid = !view.grid;
      else if (e.key.toLowerCase() === "l") toggleLock();
    }

    /* ---- lifecycle ---- */
    onMounted(async () => {
      await Promise.all([loadRecent(), loadProjects(), loadLogHistory(), loadPersons()]);
      connectWS();
      window.addEventListener("keydown", onKey);
    });

    return {
      pattern, patternMarkup, patternImgUrl, recentPatterns, projects, logs,
      wsConnected, logsPaused, dragOver, toast, view, calib, projectForm,
      overlays, scale, locked, calibrated, hostStyle, gridStyle, zoomAnchor, anchorMarkerStyle,
      toggle, focusOverlay, setRef,
      selectPattern, uploadFile, deletePattern,
      setScale, zoom, setRotation, rotate, setPos, centerPattern, resetAll, fitToScreen,
      runCalibration, applyReference, resetCalibration, toggleLock,
      startPatternDrag, onStageWheel,
      regions, regionDrawMode, drawingRect, drawingRectStyle, regionOpen,
      regionScreenPoints, toggleRegionDrawMode, startRegionDraw,
      renameRegion, deleteRegion, toggleRegionOpen, zoomRegion, onRegionWheel,
      setRegionViewportEl, regionContentStyle, pushRegions,
      persons, personForm, activePersonId, activePerson,
      resetPersonForm, editPerson, savePersonForm, deletePersonRecord, setActivePerson,
      sizeChart, sizeGuideCategory, sizeGuideValue, activeSizeChart, sizeGuideMatch,
      persistSizeChart, resetSizeChart, addSizeRow, deleteSizeRow,
      saveProject, openProject, deleteProject, exportAs,
      clearLogs, exportLogs, fmtLog,
    };
  },
  template: MAIN_TEMPLATE,
}).mount("#app");
