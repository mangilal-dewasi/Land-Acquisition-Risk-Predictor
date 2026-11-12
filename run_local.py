import os
import subprocess
import sys
import time


ROOT = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(ROOT, "models")
CLASSIFIER_PKL = os.path.join(MODELS_DIR, "calibrated_delay_classifier.pkl")


def main():
    if not os.path.exists(CLASSIFIER_PKL):
        print("Training scikit-learn .pkl models on local dataset...")
        subprocess.check_call([sys.executable, os.path.join("ml", "train_model.py")], cwd=ROOT)

    print("Starting Python FastAPI model server on http://127.0.0.1:8000 ...")
    api_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "ml.server:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=ROOT,
    )

    time.sleep(1.5)
    print("Starting frontend dev server on http://localhost:3000 ...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    web_proc = subprocess.Popen([npm_cmd, "run", "dev"], cwd=ROOT)

    try:
        web_proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down local servers...")
    finally:
        api_proc.terminate()
        web_proc.terminate()


if __name__ == "__main__":
    main()
