/*
When coding out this file,
I referred to these resources:

https://www.w3schools.com/js/js_classes.asp

https://www.w3schools.com/js/js_htmldom_html.asp


*/

class proxyInterface{
    constructor(){

        this.UIState = {
            idle: "Idle",
            listening: "Listening",
            waiting: "Waiting",
            displaying: "Displaying",
            error: "Error"
        };
        this.uiState;
        this.lastMsg;
        this.lastError;

        this.initUI();
    };

    initUI(){
        this.uiState = this.UIState.idle;
        this.lastMsg = "";
        this.lastError = null;
    };

    //the environment variable, display is the screen
    //that displays this module's visible output

    //the environment variable, inputChannel is a user's
    //keyboard inputs

    updateView(s){
        this.uiState = s;
        const message = this.stateText(this.uiState);
        console.log(message);
    }

    //I am assuming BH-Feedback's OutputMode is TextOnly
    showMessage(msg){
        this.lastMsg = msg;
        this.uiState = this.UIState.displaying;
        //render element
        const messageContainer = document.getElementById("renderedMessage");
        messageContainer.innerHTML = msg;
    }

    stateText(s){
        if (s == this.UIState.listening){
            return "Listening...";
        }else if (s == this.UIState.waiting){
            return "Waiting for input...";
        }else if (s == this.UIState.displaying){
            return "Processing...";
        }else if (s == this.UIState.idle){
            return "Idle";
        }else{
            return "Error";
        }
    }
};



