import logging
import time
from pathlib import Path

def setup_logger(name="ProjectProxi", log_dir="logs"):
    """
    Sets up a logger that ONLY writes to files. 
    Nothing will print to the terminal.
    """
    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    timestamp = time.strftime("%Y%m%d_%H%M%S")
    log_file = log_path / f"run_{timestamp}.log"

    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)

    f_handler = logging.FileHandler(log_file)
    f_handler.setLevel(logging.DEBUG)

    log_format = logging.Formatter(
        '%(asctime)s | [%(levelname)s] | %(filename)s:%(lineno)d (%(funcName)s) | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    f_handler.setFormatter(log_format)

    if not logger.handlers:
        logger.addHandler(f_handler)

    print(f"Logger initialized. All logs are being sent to: {log_file}")

    return logger