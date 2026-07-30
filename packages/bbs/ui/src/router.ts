import {
  createRouter,
  createWebHistory,
} from "vue-router";
import { getToken } from "./api";
import { bootstrap, session } from "./session";

const router = createRouter({
  history: createWebHistory("/admin/bbs-app/"),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("./views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/forbidden",
      name: "forbidden",
      component: () => import("./views/ForbiddenView.vue"),
      meta: { public: true },
    },
    {
      path: "/",
      component: () => import("./layouts/ShellLayout.vue"),
      meta: { requiresAuth: true },
      children: [
        {
          path: "",
          name: "home",
          component: () => import("./views/BoardsView.vue"),
        },
        {
          path: "board/:boardId",
          name: "board",
          component: () => import("./views/BoardsView.vue"),
          props: true,
        },
        {
          path: "board/:boardId/post/:postNum",
          name: "post",
          component: () => import("./views/BoardsView.vue"),
          props: true,
        },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  if (!session.ready) {
    const gate = await bootstrap();
    if (gate === "login" && !to.meta.public) {
      return {
        name: "login",
        query: { redirect: to.fullPath },
      };
    }
    if (gate === "forbidden" && to.name !== "forbidden") {
      return { name: "forbidden" };
    }
    if (
      gate === "ok" &&
      (to.name === "login" || to.name === "forbidden")
    ) {
      return { name: "home" };
    }
  }
  if (!to.meta.public && !getToken()) {
    return {
      name: "login",
      query: { redirect: to.fullPath },
    };
  }
  return true;
});

export default router;
