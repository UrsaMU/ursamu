import { createRouter, createWebHistory } from "vue-router";
import { getToken } from "@/api/client";
import { useSessionStore } from "@/stores/session";

const router = createRouter({
  history: createWebHistory("/admin/"),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/forbidden",
      name: "forbidden",
      component: () => import("@/views/ForbiddenView.vue"),
      meta: { public: true },
    },
    {
      path: "/",
      name: "app",
      component: () => import("@/layouts/AppLayout.vue"),
      meta: { requiresAuth: true },
      children: [
        {
          path: "",
          name: "dashboard",
          component: () => import("@/views/DashboardView.vue"),
        },
        // Play lives on the public site (/play), not staff console.
        {
          path: "play",
          redirect: () => {
            if (typeof window !== "undefined") {
              window.location.assign("/play");
            }
            return { name: "dashboard" };
          },
        },
        {
          path: "wiki",
          name: "wiki",
          component: () => import("@/views/WikiView.vue"),
        },
        {
          path: "wiki/new",
          name: "wiki-new",
          component: () => import("@/views/WikiCreateView.vue"),
        },
        {
          path: "wiki/edit/:path(.*)",
          name: "wiki-edit",
          component: () => import("@/views/WikiEditView.vue"),
          props: true,
        },
        {
          path: "db",
          name: "db",
          component: () => import("@/views/DbView.vue"),
        },
        {
          path: "db/:id",
          name: "db-detail",
          component: () => import("@/views/DbView.vue"),
          props: true,
        },
        // Legacy Players URLs → Database (players folded into DB)
        {
          path: "players",
          redirect: (to) => ({
            name: "db",
            query: {
              filter: typeof to.query.filter === "string" &&
                  ["online", "offline", "staff"].includes(
                    to.query.filter,
                  )
                ? to.query.filter
                : "player",
            },
          }),
        },
        {
          path: "players/:id",
          redirect: (to) => ({
            name: "db-detail",
            params: { id: to.params.id },
          }),
        },
        {
          path: "jobs",
          name: "jobs",
          component: () => import("@/views/JobsView.vue"),
        },
        {
          path: "jobs/:id",
          name: "job-detail",
          component: () => import("@/views/JobsView.vue"),
          props: true,
        },
        {
          path: "bbs",
          name: "bbs",
          component: () => import("@/views/BbsView.vue"),
        },
        {
          path: "bbs/:boardId",
          name: "bbs-board",
          component: () => import("@/views/BbsView.vue"),
          props: true,
        },
        {
          path: "bbs/:boardId/posts/:postNum",
          name: "bbs-post",
          component: () => import("@/views/BbsView.vue"),
          props: true,
        },
        {
          path: "mail",
          name: "mail",
          component: () => import("@/views/MailView.vue"),
        },
        {
          path: "mail/:id",
          name: "mail-detail",
          component: () => import("@/views/MailView.vue"),
          props: true,
        },
        {
          path: "channels",
          name: "channels",
          component: () => import("@/views/ChannelsView.vue"),
        },
        {
          path: "channels/:id",
          name: "channels-detail",
          component: () => import("@/views/ChannelsView.vue"),
          props: true,
        },
        {
          path: "help",
          name: "help",
          component: () => import("@/views/HelpView.vue"),
        },
        {
          path: "help/t/:topic(.*)",
          name: "help-detail",
          component: () => import("@/views/HelpView.vue"),
          props: true,
        },
        {
          path: "settings",
          name: "settings",
          component: () => import("@/views/SettingsView.vue"),
        },
        {
          path: "map",
          name: "map",
          component: () => import("@/views/MapView.vue"),
        },
        {
          path: "ext/:pluginId",
          name: "plugin-embed",
          component: () => import("@/views/PluginEmbedView.vue"),
          props: true,
        },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  if (!session.bootstrapped) {
    const gate = await session.bootstrap();
    if (gate === "login" && !to.meta.public) {
      return { name: "login", query: { redirect: to.fullPath } };
    }
    if (gate === "forbidden" && to.name !== "forbidden") {
      return { name: "forbidden" };
    }
    if (gate === "app" && (to.name === "login" || to.name === "forbidden")) {
      return { name: "dashboard" };
    }
  }

  if (to.meta.requiresAuth && !getToken()) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.name === "login" && getToken() && session.isStaff) {
    return { name: "dashboard" };
  }
  if (session.forbidden && to.name !== "forbidden" && to.name !== "login") {
    return { name: "forbidden" };
  }
  return true;
});

export default router;
