#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;             // map clip-space [-1,1] to UV [0,1]
  gl_Position = vec4(a_pos, 0, 1);
}
