# Avatar group hover

Use this for a compact horizontal row where proximity should reinforce the hovered or focused item. The active avatar rises and grows; neighboring avatars follow with an exponential falloff, then the row returns on a softer spring curve.

[Complete code example](examples/transitions/controls/avatar-group-hover.md).

Check the flat initial row, then hover and keyboard-focus every avatar to verify the active lift, neighbor falloff, stacking, and spring return. Move quickly across the row to confirm no avatar captures stale state. Enabling reduced motion while an avatar is raised must flatten the row immediately. Cleanup must remove interaction and inline transforms.
