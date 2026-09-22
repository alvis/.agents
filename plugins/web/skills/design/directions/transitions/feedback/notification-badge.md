# Notification badge

[Code example](examples/transitions/feedback/notification-badge.md)

Use this pattern when a count or unseen-state marker appears over a stable trigger. The trigger never moves; only the badge enters or leaves.

Import `assets/transitions/motion.css` once before using this recipe.

Check the initial visible badge, toggle it off and on rapidly, and confirm the count never changes the trigger's position. With reduced motion enabled, the same unread/all-caught-up states must update without travel or scale motion; after cleanup, the trigger must no longer respond.
