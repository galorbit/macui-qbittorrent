<script setup lang="ts">
/**
 * Root application shell.
 *
 * The authenticated layout (sidebar / bottom nav) lives in AppLayout so the
 * login screen can render without any chrome.
 */
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { setUnauthorizedHandler } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'
import ToastHost from '@/components/ToastHost.vue'

const auth = useAuthStore()
const session = useSessionStore()

onMounted(async () => {
  // Any 403 that is not an IP ban means our session went away; reflect that in
  // the store so the router guard sends the user to the login screen.
  setUnauthorizedHandler(() => {
    auth.markSignedOut()
  })

  // Probe for an existing session (e.g. user reloaded the page). A failure
  // simply means "show the login screen", so it is not an error condition.
  await auth.probe()
  if (auth.isAuthenticated) void session.start()
})
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" :key="route.path" />
    </Transition>
  </RouterView>

  <!-- Global toast stack; lives outside the layout so it survives navigation. -->
  <ToastHost />
</template>