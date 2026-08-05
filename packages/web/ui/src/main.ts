import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
// Host theme first — plugins inherit CSS variables from here.
import "./assets/staff-theme.css";
import "./assets/pico.min.css";
import "./assets/styles.css";
import "./assets/vue-overrides.css";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
