# Like button

Use this for a boolean favorite action that merits a brief celebration. The heart fills, its HTML wrapper pops to preserve SVG sharpness, and eight particles travel along distinct vectors only when entering the liked state.

[Complete code example](examples/transitions/controls/like-button.md).

Check the unliked initial state, then activate by pointer and keyboard. The heart must fill and pop while all particles radiate once; unliking must reverse the fill without a burst. Toggle rapidly to verify timers cannot remove a newer burst. Reduced motion must retain the state and label changes without pop or particles. Cleanup must cancel the burst timer and disable activation.
