"""Disable vendor debug/history logging before entering the official CLI."""
import logging


class QuietHistory:
    def log_event(self, *args, **kwargs):
        pass


def main():
    logging.disable(logging.CRITICAL)
    from colab_cli import common
    common.setup_logging = lambda *args, **kwargs: None
    common.state._history = QuietHistory()
    # The CLI's default detached daemon enables vendor logging again.
    # Our collector sends authenticated keep-alive requests itself.
    from colab_cli.commands import session
    session.spawn_keep_alive = lambda *args, **kwargs: None
    from colab_cli.cli import main as cli_main
    return cli_main()


if __name__ == "__main__": main()
