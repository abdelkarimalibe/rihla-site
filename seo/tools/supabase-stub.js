/* Stand-in for the Supabase library in local checks. The real one is loaded from a CDN that
   the audit sandbox cannot reach, and a check must never touch the live Members Area.
   A password of "wrong" fails, anything else succeeds. window.__stubSession sets the session. */
window.supabase = {
  createClient: function () {
    return {
      auth: {
        signInWithPassword: async function (c) {
          return c.password === 'wrong' ? { data: {}, error: { message: 'Invalid login credentials' } } : { data: {}, error: null };
        },
        signUp: async function (c) {
          return c.password === 'wrong' ? { data: {}, error: { message: 'Sign up failed' } } : { data: {}, error: null };
        },
        resetPasswordForEmail: async function () { return { data: {}, error: null }; },
        updateUser: async function (c) {
          return c.password === 'wrong' ? { data: {}, error: { message: 'Update failed' } } : { data: {}, error: null };
        },
        getSession: async function () { return { data: { session: window.__stubSession || null }, error: null }; },
        signOut: async function () { return { error: null }; },
        onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; }
      }
    };
  }
};
