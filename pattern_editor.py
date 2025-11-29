import tkinter as tk
from tkinter import messagebox, filedialog, simpledialog
import tkinter.font as tkfont

try:
    from PIL import Image, ImageTk
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

class PatternEditor:
    def __init__(self, root):
        self.root = root
        self.root.title("Éditeur de Patterns Avancé - Jeu de la Vie")
        self.root.geometry("1200x800")
        self.root.configure(bg="#1e1e1e")

        # Default Grid Size
        self.rows = 30
        self.cols = 30
        self.cell_size = 20
        self.grid_data = {} # (r, c) -> bool
        
        # History for Undo/Redo
        self.history = []
        self.redo_stack = []

        # Styles
        self.bg_color = "#1e1e1e"
        self.fg_color = "#ffffff"
        self.accent_color = "#2196F3"
        self.grid_line_color = "#333333"
        self.cell_alive_color = "#ffffff"
        self.cell_dead_color = "#000000"
        
        self.setup_ui()

    def setup_ui(self):
        # --- Top Control Panel ---
        control_frame = tk.Frame(self.root, bg=self.bg_color, pady=10)
        control_frame.pack(fill="x", padx=20)

        # Grid Size
        tk.Label(control_frame, text="L:", bg=self.bg_color, fg=self.fg_color).pack(side="left", padx=2)
        self.width_entry = tk.Entry(control_frame, width=4)
        self.width_entry.insert(0, "30")
        self.width_entry.pack(side="left", padx=2)

        tk.Label(control_frame, text="H:", bg=self.bg_color, fg=self.fg_color).pack(side="left", padx=2)
        self.height_entry = tk.Entry(control_frame, width=4)
        self.height_entry.insert(0, "30")
        self.height_entry.pack(side="left", padx=2)

        tk.Button(control_frame, text="Set", command=self.create_grid, 
                  bg="#444", fg="white", relief="flat", padx=5).pack(side="left", padx=5)

        # Tools
        tk.Frame(control_frame, width=20, bg=self.bg_color).pack(side="left") # Spacer

        tk.Button(control_frame, text="Effacer", command=self.clear_grid, 
                  bg="#f44336", fg="white", relief="flat", padx=10).pack(side="left", padx=5)

        tk.Button(control_frame, text="Import Image", command=self.import_image_dialog, 
                  bg="#FF9800", fg="white", relief="flat", padx=10).pack(side="left", padx=5)
        
        tk.Button(control_frame, text="Import RLE", command=self.import_rle_dialog, 
                  bg="#9C27B0", fg="white", relief="flat", padx=10).pack(side="left", padx=5)

        # Undo/Redo
        tk.Frame(control_frame, width=20, bg=self.bg_color).pack(side="left") # Spacer
        tk.Button(control_frame, text="↶ Undo", command=self.undo, bg="#555", fg="white", relief="flat").pack(side="left", padx=2)
        tk.Button(control_frame, text="↷ Redo", command=self.redo, bg="#555", fg="white", relief="flat").pack(side="left", padx=2)

        # --- Main Content Area (Split) ---
        content_frame = tk.Frame(self.root, bg=self.bg_color)
        content_frame.pack(fill="both", expand=True, padx=20, pady=10)

        # Left: Tools & Manipulation
        tools_panel = tk.Frame(content_frame, bg=self.bg_color, width=50)
        tools_panel.pack(side="left", fill="y", padx=(0, 10))

        tk.Label(tools_panel, text="Déplacer", bg=self.bg_color, fg="#aaa", font=("Arial", 8)).pack(pady=(0, 5))
        
        nav_frame = tk.Frame(tools_panel, bg=self.bg_color)
        nav_frame.pack()
        
        tk.Button(nav_frame, text="▲", command=lambda: self.shift_pattern(0, -1), width=3, bg="#333", fg="white").grid(row=0, column=1)
        tk.Button(nav_frame, text="◄", command=lambda: self.shift_pattern(-1, 0), width=3, bg="#333", fg="white").grid(row=1, column=0)
        tk.Button(nav_frame, text="▼", command=lambda: self.shift_pattern(0, 1), width=3, bg="#333", fg="white").grid(row=1, column=1)
        tk.Button(nav_frame, text="►", command=lambda: self.shift_pattern(1, 0), width=3, bg="#333", fg="white").grid(row=1, column=2)

        tk.Label(tools_panel, text="Transformer", bg=self.bg_color, fg="#aaa", font=("Arial", 8)).pack(pady=(15, 5))
        tk.Button(tools_panel, text="Rotation 90°", command=self.rotate_pattern, width=12, bg="#333", fg="white").pack(pady=2)
        tk.Button(tools_panel, text="Miroir H", command=lambda: self.flip_pattern('h'), width=12, bg="#333", fg="white").pack(pady=2)
        tk.Button(tools_panel, text="Miroir V", command=lambda: self.flip_pattern('v'), width=12, bg="#333", fg="white").pack(pady=2)
        tk.Button(tools_panel, text="Centrer", command=self.center_pattern, width=12, bg="#333", fg="white").pack(pady=2)


        # Center: Canvas Container (Scrollable)
        canvas_container = tk.Frame(content_frame, bg="#000000", bd=2, relief="sunken")
        canvas_container.pack(side="left", fill="both", expand=True)

        self.canvas = tk.Canvas(canvas_container, bg="#000000", highlightthickness=0)
        
        # Scrollbars for canvas
        h_scroll = tk.Scrollbar(canvas_container, orient="horizontal", command=self.canvas.xview)
        v_scroll = tk.Scrollbar(canvas_container, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(xscrollcommand=h_scroll.set, yscrollcommand=v_scroll.set)
        
        h_scroll.pack(side="bottom", fill="x")
        v_scroll.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)

        self.canvas.bind("<Button-1>", self.on_canvas_click)
        self.canvas.bind("<B1-Motion>", self.on_canvas_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_canvas_release) # For undo history

        # Right: Output Panel
        right_panel = tk.Frame(content_frame, bg=self.bg_color, width=250)
        right_panel.pack(side="right", fill="y", padx=(20, 0))

        tk.Label(right_panel, text="Résultat (Copier-Coller):", bg=self.bg_color, fg=self.fg_color, font=("Arial", 10, "bold")).pack(anchor="w", pady=(0, 5))
        
        self.output_text = tk.Text(right_panel, height=20, width=35, bg="#2d2d2d", fg="#00ff00", 
                                   insertbackground="white", font=("Consolas", 9))
        self.output_text.pack(fill="both", expand=True)

        btn_frame = tk.Frame(right_panel, bg=self.bg_color)
        btn_frame.pack(fill="x", pady=10)

        tk.Button(btn_frame, text="Générer Code", command=self.generate_code, 
                  bg=self.accent_color, fg="white", relief="flat", pady=5).pack(fill="x", pady=2)
        
        tk.Button(btn_frame, text="Copier dans le Presse-papier", command=self.copy_to_clipboard, 
                  bg="#4CAF50", fg="white", relief="flat", pady=5).pack(fill="x", pady=2)

        self.create_grid()

    # --- Grid & Drawing ---

    def create_grid(self):
        try:
            self.cols = int(self.width_entry.get())
            self.rows = int(self.height_entry.get())
        except ValueError:
            return

        self.canvas.delete("all")
        self.grid_data = {}
        self.history = [] # Reset history on resize
        self.redo_stack = []
        
        width = self.cols * self.cell_size
        height = self.rows * self.cell_size
        
        self.canvas.config(scrollregion=(0, 0, width, height))

        # Draw grid lines
        for r in range(self.rows + 1):
            y = r * self.cell_size
            self.canvas.create_line(0, y, width, y, fill=self.grid_line_color)
        
        for c in range(self.cols + 1):
            x = c * self.cell_size
            self.canvas.create_line(x, 0, x, height, fill=self.grid_line_color)

    def redraw_grid(self):
        # Clear cells only (keep grid lines if possible, but easier to clear all)
        self.canvas.delete("cell") # We will tag cells with "cell"
        
        for (r, c), alive in self.grid_data.items():
            if alive:
                self.draw_cell_rect(r, c)

    def draw_cell_rect(self, r, c):
        x1 = c * self.cell_size + 1
        y1 = r * self.cell_size + 1
        x2 = (c + 1) * self.cell_size - 1
        y2 = (r + 1) * self.cell_size - 1
        self.canvas.create_rectangle(x1, y1, x2, y2, fill=self.cell_alive_color, outline="", tags="cell")

    def toggle_cell(self, r, c, state=None):
        if 0 <= r < self.rows and 0 <= c < self.cols:
            key = (r, c)
            current_state = self.grid_data.get(key, False)
            
            if state is None:
                new_state = not current_state
            else:
                new_state = state
            
            if current_state != new_state:
                self.grid_data[key] = new_state
                # Redraw just this cell for performance
                # Find existing rect? Hard without ID. Just redraw all or be smart.
                # Being smart:
                self.redraw_grid() # Simple for now, optimization later if needed

    def on_canvas_click(self, event):
        self.save_state() # Save before modification
        x = self.canvas.canvasx(event.x)
        y = self.canvas.canvasy(event.y)
        c = int(x // self.cell_size)
        r = int(y // self.cell_size)
        self.toggle_cell(r, c)
        self.last_drag_cell = (r, c)
        self.drag_state = self.grid_data.get((r, c), False)

    def on_canvas_drag(self, event):
        x = self.canvas.canvasx(event.x)
        y = self.canvas.canvasy(event.y)
        c = int(x // self.cell_size)
        r = int(y // self.cell_size)
        
        if (r, c) != getattr(self, 'last_drag_cell', None):
            self.toggle_cell(r, c, self.drag_state)
            self.last_drag_cell = (r, c)

    def on_canvas_release(self, event):
        pass

    def clear_grid(self):
        self.save_state()
        self.grid_data = {}
        self.redraw_grid()

    # --- Undo / Redo ---

    def save_state(self):
        # Deep copy of grid_data
        self.history.append(self.grid_data.copy())
        self.redo_stack.clear()
        if len(self.history) > 50: # Limit history
            self.history.pop(0)

    def undo(self):
        if self.history:
            self.redo_stack.append(self.grid_data.copy())
            self.grid_data = self.history.pop()
            self.redraw_grid()

    def redo(self):
        if self.redo_stack:
            self.history.append(self.grid_data.copy())
            self.grid_data = self.redo_stack.pop()
            self.redraw_grid()

    # --- Manipulation ---

    def shift_pattern(self, dx, dy):
        self.save_state()
        new_data = {}
        for (r, c), alive in self.grid_data.items():
            if alive:
                nr, nc = r + dy, c + dx
                if 0 <= nr < self.rows and 0 <= nc < self.cols:
                    new_data[(nr, nc)] = True
        self.grid_data = new_data
        self.redraw_grid()

    def rotate_pattern(self):
        self.save_state()
        # Rotate 90 degrees clockwise around center of grid
        center_r = self.rows / 2
        center_c = self.cols / 2
        new_data = {}
        
        for (r, c), alive in self.grid_data.items():
            if alive:
                # Translate to origin
                tr = r - center_r
                tc = c - center_c
                # Rotate (x, y) -> (-y, x)  => (c, r) -> (-r, c)
                # In grid coords (row=y, col=x): new_c = -tr, new_r = tc
                nr = int(tc + center_r)
                nc = int(-tr + center_c)
                
                if 0 <= nr < self.rows and 0 <= nc < self.cols:
                    new_data[(nr, nc)] = True
        self.grid_data = new_data
        self.redraw_grid()

    def flip_pattern(self, mode):
        self.save_state()
        new_data = {}
        for (r, c), alive in self.grid_data.items():
            if alive:
                if mode == 'h': # Horizontal flip (mirror across vertical axis)
                    nc = self.cols - 1 - c
                    nr = r
                else: # Vertical flip
                    nr = self.rows - 1 - r
                    nc = c
                
                if 0 <= nr < self.rows and 0 <= nc < self.cols:
                    new_data[(nr, nc)] = True
        self.grid_data = new_data
        self.redraw_grid()

    def center_pattern(self):
        self.save_state()
        if not self.grid_data: return

        # Find bounds
        min_r, max_r = self.rows, -1
        min_c, max_c = self.cols, -1
        for (r, c), alive in self.grid_data.items():
            if alive:
                min_r = min(min_r, r)
                max_r = max(max_r, r)
                min_c = min(min_c, c)
                max_c = max(max_c, c)
        
        p_height = max_r - min_r + 1
        p_width = max_c - min_c + 1
        
        target_r = (self.rows - p_height) // 2
        target_c = (self.cols - p_width) // 2
        
        dr = target_r - min_r
        dc = target_c - min_c
        
        new_data = {}
        for (r, c), alive in self.grid_data.items():
            if alive:
                new_data[(r + dr, c + dc)] = True
        
        self.grid_data = new_data
        self.redraw_grid()

    # --- Import / Export ---

    def generate_code(self):
        # Determine bounding box to trim empty space
        min_r, max_r = self.rows, -1
        min_c, max_c = self.cols, -1
        
        has_cells = False
        for (r, c), alive in self.grid_data.items():
            if alive:
                has_cells = True
                min_r = min(min_r, r)
                max_r = max(max_r, r)
                min_c = min(min_c, c)
                max_c = max(max_c, c)
        
        if not has_cells:
            self.output_text.delete("1.0", tk.END)
            self.output_text.insert("1.0", "No cells drawn.")
            return

        # Generate string
        lines = []
        for r in range(min_r, max_r + 1):
            line = ""
            for c in range(min_c, max_c + 1):
                if self.grid_data.get((r, c), False):
                    line += "O"
                else:
                    line += "."
            lines.append(line)
        
        result = "\n".join(lines)
        
        # Format as JS Object property
        formatted_output = f"{{ name: \"MyPattern\", rle: `\n{result}` }}"
        
        self.output_text.delete("1.0", tk.END)
        self.output_text.insert("1.0", formatted_output)

    def copy_to_clipboard(self):
        text = self.output_text.get("1.0", tk.END).strip()
        if text:
            self.root.clipboard_clear()
            self.root.clipboard_append(text)
            self.root.update() # Keep clipboard after window closes
            messagebox.showinfo("Succès", "Copié dans le presse-papier !")

    def import_image_dialog(self):
        if not HAS_PIL:
            messagebox.showerror("Erreur", "Le module 'Pillow' est requis.\npip install pillow")
            return

        file_path = filedialog.askopenfilename(filetypes=[("Images", "*.png;*.jpg;*.jpeg;*.bmp;*.gif")])
        if not file_path:
            return

        # Simple dialog for threshold
        threshold = simpledialog.askinteger("Seuil", "Seuil de luminosité (0-255) :\n(Les pixels plus sombres/clairs seront actifs)", initialvalue=128, minvalue=0, maxvalue=255)
        if threshold is None: return

        try:
            self.save_state()
            img = Image.open(file_path).convert("L")
            
            # Keep aspect ratio
            img_ratio = img.width / img.height
            grid_ratio = self.cols / self.rows
            
            target_w, target_h = self.cols, self.rows
            
            if img_ratio > grid_ratio:
                # Image is wider, fit to width
                target_h = int(self.cols / img_ratio)
            else:
                # Image is taller, fit to height
                target_w = int(self.rows * img_ratio)
                
            img = img.resize((target_w, target_h), Image.Resampling.NEAREST)
            
            # Center image
            offset_x = (self.cols - target_w) // 2
            offset_y = (self.rows - target_h) // 2
            
            # Auto-detect polarity
            pixels = list(img.getdata())
            avg_brightness = sum(pixels) / len(pixels)
            is_light_bg = avg_brightness > 127
            
            self.grid_data = {} # Clear current
            
            width, height = img.size
            for y in range(height):
                for x in range(width):
                    pixel = img.getpixel((x, y))
                    is_alive = False
                    
                    if is_light_bg:
                        if pixel < threshold: is_alive = True
                    else:
                        if pixel > threshold: is_alive = True
                        
                    if is_alive:
                        self.grid_data[(y + offset_y, x + offset_x)] = True
            
            self.redraw_grid()
                        
        except Exception as e:
            messagebox.showerror("Erreur", f"Impossible de traiter l'image : {e}")

    def import_rle_dialog(self):
        # Create a popup window
        popup = tk.Toplevel(self.root)
        popup.title("Importer RLE / ASCII")
        popup.geometry("400x300")
        popup.configure(bg=self.bg_color)
        
        tk.Label(popup, text="Collez votre pattern ici (. = mort, O = vivant):", bg=self.bg_color, fg="white").pack(pady=5)
        
        text_area = tk.Text(popup, height=10, bg="#333", fg="white", insertbackground="white")
        text_area.pack(fill="both", expand=True, padx=10, pady=5)
        
        def apply_import():
            content = text_area.get("1.0", tk.END).strip()
            if not content: return
            
            self.save_state()
            self.grid_data = {}
            
            rows = content.split('\n')
            # Find center
            start_r = (self.rows - len(rows)) // 2
            
            for r, line in enumerate(rows):
                line = line.strip()
                start_c = (self.cols - len(line)) // 2
                for c, char in enumerate(line):
                    if char in ['O', '#', '*', '0']: # Common alive chars
                        self.grid_data[(start_r + r, start_c + c)] = True
            
            self.redraw_grid()
            popup.destroy()
            
        tk.Button(popup, text="Importer", command=apply_import, bg=self.accent_color, fg="white").pack(pady=10)

if __name__ == "__main__":
    root = tk.Tk()
    app = PatternEditor(root)
    root.mainloop()
