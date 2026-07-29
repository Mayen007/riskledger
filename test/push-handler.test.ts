import registerApp from "../src/app";

describe("push handler", () => {
  it("registers a push handler", () => {
    const app = {
      on: jest.fn(),
      log: {
        info: jest.fn(),
      },
    } as {
      on: jest.Mock;
      log: { info: jest.Mock };
    };

    registerApp(app as never);

    expect(app.on).toHaveBeenCalledWith("push", expect.any(Function));
  });
});