# Matrix loader

[Code example](examples/transitions/feedback/matrix-loader.md)

Use this compact loader beside a status label in dense interfaces. The label communicates progress; the 4×4 dot matrix is decorative and may switch among four timing patterns without rebuilding the DOM.

Import `assets/transitions/motion.css` once before using this recipe.

The 1.2-second cycle keeps the loader legible at this small size without flickering. Exercise every pattern and the rounded option, pause and resume each one, and toggle reduced motion while dots are active; the status label must remain meaningful when all dots become static. After cleanup, controls must no longer change the loader.
