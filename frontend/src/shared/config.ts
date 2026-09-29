/** Each build is either a complete server instance or a self-contained local editor. */
export const cloudEnabled = import.meta.env.VITE_APP_MODE !== "local";
