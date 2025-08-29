<template lang="pug">
  #app
    //- RESTORED: This component is the container for all the original CSS rules.
    //- It is now locked in place to provide structure, not movement.
    vue-draggable-resizable#vue-draggable(
      :w="600" 
      :h="600"
      :x="0" 
      :y="0"
      :draggable="false"
      :resizable="false"
    )
      div.drag-handle.menu-top-bar
        .left-aligned
          a(
            href="https://ko-fi.com/belvederef"
            target="_blank"
          )
            img#support-button(src="/assets/support.png")
        .center-aligned
          button.play-pause.play-pause__start(
            v-if="isPaused"
            @click="onPlayPauseButtonPress" 
          ) Play
          button.play-pause.play-pause__stop(
            v-else
            @click="onPlayPauseButtonPress"
          ) Pause
        .right-aligned
          button.button__traffic.button__traffic__minimize(@click="minimizeWindow()") –
          button.button__traffic.button__traffic__close(@click="closeApp()") x
      div#menu
        .group
          label Choose background
            br
            dropdown(
              @change="onBackgroundImgChange" 
              :options="backgroundImages" 
              :selected-idx="settings.selectedImgIdx"
            )
          br
          div(style="display: flex; flex-align: row; justify-content: space-between;")
            label Choose interval
              br
              dropdown(
                @change="onIntervalChange" 
                :options="intervals" 
                :selected-idx="settings.selectedIntervalIdx"
              )
            br
            label Choose pause
              br
              dropdown(
                @change="onPauseChange" 
                :options="pauses" 
                :selected-idx="settings.selectedPauseIdx" 
                :is-disabled="settings.selectedIntervalIdx === 0"
              )
        .group
          label Opacity level
            vue-slider.slider(
              :enable-cross="false"
              :value="settings.opacity"
              :min="1"
              :max="16"
              :adsorb="true"
              :interval="1"
              :marks="true"
              @change="onOpacityChange"
            )
          br
          br
          label Speed
            vue-slider.slider(
              :enable-cross="false"
              :value="settings.speed"
              :min="0"
              :max="MAX_SPEED"
              :adsorb="true"
              :interval="1"
              :marks="true"
              @change="onSpeedChange"
            )
      div.info
        checkbox(
          label="See this screen the next time", 
          :checked="settings.showScreenNextTime" 
          @change="onShowNextTimeChange"
        )
        button#register-keybind-button(
          @click="openRegisterKeybindDialog"
        ) Register new keybind for menu
        p Press {{ this.settings.keyboardShortcutDisplay }} to open/close this menu at any time
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import ClickOutside from 'vue-click-outside';
import VueSlider from 'vue-slider-component';
import Dropdown from '@/components/Dropdown.vue';
import Checkbox from '@/components/Checkbox.vue';
import backgroundImagesData from '@/data/backgrounds';
import { INTERVALS, PAUSES } from '@/data/timer';

import 'vue-slider-component/theme/antd.css';

const DEFAULT_SETTINGS: Settings = {
  speed: 10,
  opacity: 8,
  keyboardShortcutElectron: 'CommandOrControl+Alt+0',
  keyboardShortcutDisplay: 'Ctrl+Alt+0 (or Cmd+Option+0 on Mac)',
  selectedImgIdx: 0,
  selectedPauseIdx: 0,
  selectedIntervalIdx: 0,
  showScreenNextTime: true,
};

@Component({
  components: { VueSlider, Checkbox, Dropdown },
  directives: { ClickOutside },
})
export default class App extends Vue {
  MAX_SPEED = 20;
  backgroundImages = backgroundImagesData;
  isPaused = false;
  intervals = INTERVALS;
  pauses = PAUSES;

  privateSettings = ((): Settings => {
    const storedSettings = localStorage.getItem('settings');
    return storedSettings
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) }
      : DEFAULT_SETTINGS;
  })();

  get settings(): Settings { return this.privateSettings; }

  set settings(settings) {
    this.privateSettings = settings;
    localStorage.setItem('settings', JSON.stringify(this.privateSettings));
  }
  
  // --- START OF FIX ---
  // All on...Change methods now update the local state immediately
  // before sending the IPC message. This keeps the UI in sync.

  onIntervalChange(intervalIdx: number) {
    this.settings = { ...this.settings, selectedIntervalIdx: intervalIdx };
    window.ipcRenderer.invoke('change-interval', intervalIdx);
  }
  onPauseChange(pauseIdx: number) {
    this.settings = { ...this.settings, selectedPauseIdx: pauseIdx };
    window.ipcRenderer.invoke('change-pause', pauseIdx);
  }
  onOpacityChange(opacity: number) {
    this.settings = { ...this.settings, opacity };
    window.ipcRenderer.invoke('change-overlay-opacity', opacity);
  }
  onSpeedChange(speed: number) {
    this.settings = { ...this.settings, speed };
    window.ipcRenderer.invoke('change-overlay-speed', speed);
  }
  onBackgroundImgChange(idx: number) {
    this.settings = { ...this.settings, selectedImgIdx: idx };
    window.ipcRenderer.invoke('change-overlay-image', idx);
  }
  
  // --- END OF FIX ---

  onPlayPauseButtonPress() { window.ipcRenderer.invoke('change-play-status', !this.isPaused); }
  openRegisterKeybindDialog() { window.ipcRenderer.invoke('open-keybind-dialog'); }
  closeApp() { window.ipcRenderer.invoke('close-app'); }

  minimizeWindow() {
    window.ipcRenderer.invoke('minimize-settings-window');
  }

  onShowNextTimeChange(showScreenNextTime: boolean) {
    this.settings = { ...this.settings, showScreenNextTime };
  }

  updateSettings(params: Partial<Settings>) {
    this.settings = { ...this.settings, ...params };
  }


  

  setUpHotkey() {
    const { keyboardShortcutElectron, keyboardShortcutDisplay } = this.settings;
    window.ipcRenderer.invoke('change-hotkey', {
      keyboardShortcutElectron,
      keyboardShortcutDisplay,
    });
  }

  handleSettingsChanges() {
    window.ipcRenderer.on('change-play-status', (_, status: boolean) => {
      this.isPaused = status;
    });

    window.ipcRenderer.on('change-hotkey', (_, keyBinds: ChangeKeyboardShortcut) => {
      this.updateSettings(keyBinds);
    });
  }

  mounted() {
    this.setUpHotkey();
    this.handleSettingsChanges();
    window.ipcRenderer.invoke('change-overlay-opacity', this.settings.opacity);
    window.ipcRenderer.invoke('change-overlay-speed', this.settings.speed);
    window.ipcRenderer.invoke('change-overlay-image', this.settings.selectedImgIdx);
    window.ipcRenderer.invoke('setup-timers');
     if (this.settings.showScreenNextTime) {
      window.ipcRenderer.invoke('show-settings-window');
    }
  }
}
</script>

<style lang="scss">
// Global styles can remain
body { 
  margin: 0; 
}
</style>

<style lang="scss" scoped>
// The original scoped styles will now correctly apply to the restored component
@import '@/assets/styles/main.scss';

.menu-top-bar {
  // Ensure the top bar is not showing a grab cursor since the OS handles dragging
   -webkit-app-region: drag;

  cursor: default !important;

  user-select: none;

}

.menu-top-bar:active{
    cursor: grabbing !important;
}
.menu-top-bar a,
.menu-top-bar button {
  -webkit-app-region: no-drag;
}

// The #app container should not have any special layout that might constrain the child
#app {
  overflow: hidden;
}
</style>