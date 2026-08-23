const Tools = {
	"pencil": {
		"button-id": "pencil-button",
		"hotkey": "KeyP",
		"cursor": 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5AQGFhgxWoRNiQAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAA30lEQVRYw+WXQQ4DIQhFgfSqnsrD/m6K6Ywwaiq4qIkLTZz3YNQgA6CTTehwe0V+nJlbegFwqoDCa61tbElIdOSlFFKR7/kwAQvyJCG74d6p8iQkAj6SuKzbcQ94kTOzu0Y3pETC9QR48J8FZuB3iftRlIzIdbztHlhNeynFvQnlJHxZYDd8SSACPi0QBZ8SiIQPBaLhjwIZcFcgC24KZMI7gWz4ReAE3MpAKrwTANAkMuDmJlSJDLj5C5iZAHT1WwS8RfzZfNCujYhQa9U5iuitKLXq+dGzaks1/fev4zd4NUo77jAdLAAAAABJRU5ErkJggg==") 2 28, auto',
	},
	"fill": {
		"button-id": "fill-button",
		"hotkey": "KeyB",
		"cursor": 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5AQGEwEwsEgW7AAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAA5klEQVRYw+2WwQ3DIAxF81FHygKdvAtkJ/cSWqvB4A8W9BBfIkXAexiHeNvuuGNxoHOeBK0TArfeuSIFi0wTEBEJkUiddP2URg0gsghFC3wWAfJawnLAph3ARSBL7PurOPE4niYL5Jnn3W5WJlgJsHANLWWDlUheOFOgJ+gSp5h4BWi4R+I3Hgw8F6FVA6Wx1nHUBKS1MJOJLGyJpKi0Fz+x7/3gugmnw7XAErgWgC6uWfDSwKFMVOBiMRH1/bM7b13FlEQvvDXJJTEC90ysSozC6b9hNLyrH4iE9zSiEtUNL23F/yret3CTJaSYSUIAAAAASUVORK5CYII=") 28 22, auto',
	},
	"eraser": {
		"button-id": "eraser-button",
		"hotkey": "KeyE",
		"cursor": 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAABmJLR0QAAAAAAAD5Q7t/AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5AQHAAY3x7FvxAAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAAbElEQVQ4y+XUSwrAMAgEUEd61ZzKw053IQ3mg7rr7EzgGVAi8ovgcM8bhCQAbDGSZwvoBDQLmVmvtQrysDA0YyloxNKQiMjjTGWZHfTBTi+7aabZrW+t9eXXKiiFzVAY86AQtoLGQxb+NDV5AZrtMPQP/swtAAAAAElFTkSuQmCC") 1 16, auto',
	},
	"colorpicker": {
		"button-id": "colorpicker-button",
		"hotkey": "KeyV",
		"cursor": 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5AQGEwIKXWmcnQAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAAwElEQVRYw+2XyxGAIAxECWNJNGDlNEBP8aIMHxHUbPBgbjqTfZsQQI35Y3IQWJ97TKQBZs75RFRx7ewlWMDtPqseOgO8974HJ+QMRBOtqpEGuAOG7oJs6q/anoZFbbnyuRUWAU86QGgDI/DxgdCs/K0BEfhTA2LwJwmi8LtJ4vA7iRD4aDIMPiLAzvnqZQir2DFOM+FXQirwlpga/ExQFV6KqsO7tyEaHg0453kGvPos36Faf025gWP9Q1hVwJ+JDbyOY92rcLuYAAAAAElFTkSuQmCC") 3 30, auto',
	},
	"selection": {
		"button-id": "selection-button",
		"hotkey": "KeyS",
		"cursor": "crosshair",
	},
}

function Activate_Tool(label)
{
	let object = Tools[label];
	let button = document.getElementById(object["button-id"]);
	let buttonBkgdColor = button.style.backgroundColor;

	if (STATE["activeTool"] === "selection" && label !== "selection") {
        Remove_Selection();
        Unlock_Selection();
    }

	if(STATE["activeTool"] !== label)
	{
		Set_Cursor(object["cursor"]);
		Color_Toolbar_Button_As_Down(button);

		for(let l in Tools)
		{
			if(Tools[l]["button-id"] !== object["button-id"])
			{
				let btn = document.getElementById(Tools[l]["button-id"]);
				Color_Toolbar_Button_When_Up(btn);
			}
		}
		STATE["activeTool"] = label;
	}
}

function Get_Tool_Action_Callback()
{
	// Dispatch on the tool name, not the cursor url — cursors are data URLs
	// now, so they no longer contain "pencil.png".
	const tool = STATE["activeTool"];
	if (tool === "eraser") {
		return function (cell) {
			cell.style.backgroundColor = CANVAS_INIT_COLOR;
		};
	} else if (tool === "pencil") {
		return function (cell) {
			cell.style.backgroundColor = STATE[ACTIVE_COLOR_SELECT];
		};
	} else if (tool === "fill") {
		return function (cell) {
		};
	} else if (tool === "colorpicker") {
		return function (cell) {
			const pickedColor = cell.style.backgroundColor;
			STATE[ACTIVE_COLOR_SELECT] = pickedColor;
			Update_Active_Color_Preview();
			Update_Active_Color_Label();
		};
	} else if (tool === "selection") {
		return function (cell) {
		};
	} else {
		return function (cell) {
		};
	}
}
