BUCKET = "ace-cpx-videos-2"
REGION = "ap-northeast-2"
SRC_PREFIX = "두통"
DST_PREFIX = "processed/두통"

VIEW_MAP = {"천장": "ceiling", "침상": "bedside", "평가자 시선": "evaluator"}
VIEWS = ["ceiling", "bedside", "evaluator"]
REFERENCE_VIEW = "ceiling"

DATES = ["250826_tue", "250909_tue", "251111_tue", "251202_tue", "251216_tue"]

# ffmpeg args (video/audio) applied during encode; -ss/-t/-i added per call.
FFMPEG_VIDEO_ARGS = [
    "-map", "0:v:0", "-map", "0:a:0",
    "-vf", "crop=1920:1080",
    "-r", "30000/1001",
    "-c:v", "libx264", "-profile:v", "high", "-crf", "23", "-preset", "medium",
    "-movflags", "+faststart",
]
FFMPEG_AUDIO_ARGS = ["-c:a", "aac", "-b:a", "128k"]

SYNC_WINDOW_SEC = 120        # audio window used for cross-correlation
SYNC_AUDIO_RATE = 16000      # mono resample rate for xcorr
SYNC_CONFIDENCE_MIN = 0.30   # below → flag for manual review
