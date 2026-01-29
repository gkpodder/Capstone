import sys
from pathlib import Path

root_path = Path(__file__).resolve().parents[1]
sys.path.append(str(root_path))

from src.logger import setup_logger
logger = setup_logger()

def run_test():
    logger.info("Proxi Entry Point")
    logger.debug("Debugging information here")
    logger.warning("This is a warning message")
    logger.error("This is an error message")
    logger.critical("This is a critical message")

if __name__ == "__main__":
    run_test()