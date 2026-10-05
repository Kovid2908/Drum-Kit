// -----------------------------
// DRUM SOUNDS
// -----------------------------

const soundFiles = {

    w: "sounds/tom-1.mp3",

    a: "sounds/tom-2.mp3",

    s: "sounds/tom-3.mp3",

    d: "sounds/tom-4.mp3",

    j: "sounds/snare.mp3",

    k: "sounds/crash.mp3",

    l: "sounds/kick-bass.mp3"

};


let audioContext;


// Create Audio Context
function getAudioContext() {

    if (!audioContext) {

        audioContext =
            new (window.AudioContext ||
                window.webkitAudioContext)();

    }

    if (audioContext.state === "suspended") {

        audioContext.resume();

    }

    return audioContext;

}



// -----------------------------
// NEW SYNTHESIZED SOUNDS
// -----------------------------

function playSynthSound(type) {

    const ctx = getAudioContext();

    const now = ctx.currentTime;


    // HI-HAT + OPEN HI-HAT
    if (type === "q" || type === "e") {

        const duration =
            type === "q" ? 0.07 : 0.25;


        const bufferSize =
            ctx.sampleRate * duration;


        const buffer =
            ctx.createBuffer(
                1,
                bufferSize,
                ctx.sampleRate
            );


        const data =
            buffer.getChannelData(0);


        for (let i = 0; i < bufferSize; i++) {

            data[i] =
                Math.random() * 2 - 1;

        }


        const source =
            ctx.createBufferSource();


        const filter =
            ctx.createBiquadFilter();


        const gain =
            ctx.createGain();


        source.buffer = buffer;


        filter.type = "highpass";

        filter.frequency.value = 5000;


        gain.gain.setValueAtTime(
            0.35,
            now
        );


        gain.gain.exponentialRampToValueAtTime(
            0.01,
            now + duration
        );


        source
            .connect(filter)
            .connect(gain)
            .connect(ctx.destination);


        source.start(now);

        return;

    }



    // CLAP
    if (type === "z") {

        for (let i = 0; i < 3; i++) {

            const buffer =
                ctx.createBuffer(
                    1,
                    ctx.sampleRate * 0.08,
                    ctx.sampleRate
                );


            const data =
                buffer.getChannelData(0);


            for (
                let j = 0;
                j < data.length;
                j++
            ) {

                data[j] =
                    Math.random() * 2 - 1;

            }


            const source =
                ctx.createBufferSource();


            const filter =
                ctx.createBiquadFilter();


            const gain =
                ctx.createGain();


            source.buffer = buffer;


            filter.type = "bandpass";

            filter.frequency.value = 1500;


            gain.gain.setValueAtTime(
                0.3,
                now + i * 0.018
            );


            gain.gain.exponentialRampToValueAtTime(
                0.01,
                now + i * 0.018 + 0.08
            );


            source
                .connect(filter)
                .connect(gain)
                .connect(ctx.destination);


            source.start(
                now + i * 0.018
            );

        }

        return;

    }



    // RIDE CYMBAL
    if (type === "x") {

        const osc =
            ctx.createOscillator();


        const gain =
            ctx.createGain();


        osc.type = "triangle";


        osc.frequency.value = 5000;


        gain.gain.setValueAtTime(
            0.18,
            now
        );


        gain.gain.exponentialRampToValueAtTime(
            0.01,
            now + 0.45
        );


        osc
            .connect(gain)
            .connect(ctx.destination);


        osc.start(now);

        osc.stop(now + 0.45);

    }

}



// -----------------------------
// PLAY SOUND
// -----------------------------

function playSound(key) {

    key = key.toLowerCase();


    // Existing MP3 sounds

    if (soundFiles[key]) {

        const sound =
            new Audio(soundFiles[key]);

        sound.currentTime = 0;

        sound.play();

    }


    // New JavaScript sounds

    else if (
        ["q", "e", "z", "x"].includes(key)
    ) {

        playSynthSound(key);

    }


    else {

        return;

    }


    animateButton(key);


    // Save key if recording

    if (isRecording) {

        recording.push({

            key: key,

            time:
                Date.now() - recordingStart

        });

    }

}



// -----------------------------
// BUTTON ANIMATION
// -----------------------------

function animateButton(key) {

    const button =
        document.querySelector("." + key);


    if (!button) return;


    button.classList.add("pressed");


    setTimeout(() => {

        button.classList.remove("pressed");

    }, 120);

}



// -----------------------------
// MOUSE CONTROLS
// -----------------------------

document
    .querySelectorAll(".drum")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                playSound(
                    button.innerText[0]
                );

            }
        );

    });



// -----------------------------
// KEYBOARD CONTROLS
// -----------------------------

document.addEventListener(
    "keydown",
    event => {

        if (event.repeat) return;

        playSound(event.key);

    }
);



// =====================================================
// SONG MODE
// =====================================================


const songs = {

    believer: {

        name: "Believer",

        pattern: [
            "l",
            "j",
            "l",
            "k",
            "l",
            "j",
            "l",
            "k",
            "l",
            "j",
            "l",
            "k"
        ]

    },


    shape: {

        name: "Shape of You",

        pattern: [
            "l",
            "q",
            "j",
            "q",
            "l",
            "q",
            "j",
            "q",
            "l",
            "q",
            "z",
            "q"
        ]

    },


    seven: {

        name: "Seven Nation Army",

        pattern: [
            "l",
            "l",
            "j",
            "l",
            "l",
            "j",
            "k",
            "j",
            "l",
            "l",
            "j",
            "k"
        ]

    },


    wewillrock: {

        name: "We Will Rock You",

        pattern: [
            "l",
            "l",
            "j",
            "l",
            "l",
            "j",
            "l",
            "l",
            "j",
            "k"
        ]

    },


    dust: {

        name:
            "Another One Bites The Dust",

        pattern: [
            "l",
            "j",
            "l",
            "q",
            "l",
            "j",
            "z",
            "q",
            "l",
            "j",
            "l",
            "k"
        ]

    }

};



const songSelect =
    document.getElementById(
        "songSelect"
    );


const patternText =
    document.getElementById(
        "pattern"
    );


const bpmSlider =
    document.getElementById(
        "bpm"
    );


const bpmValue =
    document.getElementById(
        "bpmValue"
    );


let songTimers = [];



// -----------------------------
// UPDATE PATTERN DISPLAY
// -----------------------------

function updatePattern() {

    const song =
        songs[songSelect.value];


    patternText.textContent =
        song.pattern.join(" ");

}


songSelect.addEventListener(
    "change",
    updatePattern
);



// -----------------------------
// BPM SLIDER
// -----------------------------

bpmSlider.addEventListener(
    "input",
    () => {

        bpmValue.textContent =
            bpmSlider.value;

    }
);



// -----------------------------
// STOP SONG
// -----------------------------

function stopSong() {

    songTimers.forEach(
        timer =>
            clearTimeout(timer)
    );


    songTimers = [];

}



// -----------------------------
// PLAY SONG
// -----------------------------

function playSong() {

    stopSong();


    const song =
        songs[songSelect.value];


    const beatTime =
        60000 /
        Number(bpmSlider.value);


    song.pattern.forEach(
        (key, index) => {

            const timer =
                setTimeout(
                    () => {

                        playSound(key);

                    },
                    index * beatTime
                );


            songTimers.push(timer);

        }
    );

}



document
    .getElementById("playSong")
    .addEventListener(
        "click",
        playSong
    );


document
    .getElementById("stopSong")
    .addEventListener(
        "click",
        stopSong
    );



// =====================================================
// RECORDING MODE
// =====================================================


let isRecording = false;

let recording = [];

let recordingStart = 0;


const recordBtn =
    document.getElementById(
        "recordBtn"
    );


const recordStatus =
    document.getElementById(
        "recordStatus"
    );



// -----------------------------
// START / STOP RECORDING
// -----------------------------

recordBtn.addEventListener(
    "click",
    () => {

        if (!isRecording) {

            recording = [];

            isRecording = true;

            recordingStart =
                Date.now();


            recordBtn.textContent =
                "■ Stop Recording";


            recordStatus.textContent =
                "Recording... play your beat!";

        }


        else {

            isRecording = false;


            recordBtn.textContent =
                "● Record";


            recordStatus.textContent =
                recording.length

                    ? `Recorded ${recording.length} drum hits.`

                    : "Nothing recorded.";

        }

    }
);



// -----------------------------
// CLEAR RECORDING
// -----------------------------

document
    .getElementById(
        "clearRecording"
    )
    .addEventListener(
        "click",
        () => {

            recording = [];

            isRecording = false;


            recordBtn.textContent =
                "● Record";


            recordStatus.textContent =
                "Recording cleared.";

        }
    );



// -----------------------------
// PLAY RECORDING
// -----------------------------

document
    .getElementById(
        "playRecording"
    )
    .addEventListener(
        "click",
        () => {

            if (!recording.length) {

                recordStatus.textContent =
                    "Record something first!";

                return;

            }


            recording.forEach(
                hit => {

                    setTimeout(
                        () => {

                            playSound(
                                hit.key
                            );

                        },
                        hit.time
                    );

                }
            );


            recordStatus.textContent =
                "Playing your recording...";

        }
    );



// Initial pattern

updatePattern();