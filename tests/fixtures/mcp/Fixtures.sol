pragma solidity 0.8.24;

contract FixtureToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public immutable market;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory name_, string memory symbol_, address market_) {
        name = name_;
        symbol = symbol_;
        market = market_;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == market);
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount && balanceOf[from] >= amount);
        allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract FixtureMarket {
    address constant WETH = 0x4200000000000000000000000000000000000006;
    mapping(address => bool) public inactive;

    event Trade(address indexed token, address indexed trader, address indexed quote, bool isBuy, uint256 quoteAmount, uint256 tokenAmount, uint256 realQuote, uint256 realToken, uint256 protocolFee, uint256 creatorFee);

    error Slippage();
    error NotActive();

    function setInactive(address token, bool value) external {
        inactive[token] = value;
    }

    function buyWithEth(address token, uint256 minTokensOut) external payable {
        if (inactive[token]) revert NotActive();
        uint256 out = msg.value * 1000;
        if (out < minTokensOut) revert Slippage();
        FixtureToken(token).mint(msg.sender, out);
        emit Trade(token, msg.sender, WETH, true, msg.value, out, 0, 0, msg.value / 200, msg.value / 200);
    }

    function sellToEth(address token, uint256 tokenAmount, uint256 minQuoteOut) external returns (uint256 quoteOut) {
        if (inactive[token]) revert NotActive();
        quoteOut = tokenAmount / 1000;
        if (quoteOut < minQuoteOut) revert Slippage();
        FixtureToken(token).transferFrom(msg.sender, address(this), tokenAmount);
        payable(msg.sender).transfer(quoteOut);
        emit Trade(token, msg.sender, WETH, false, quoteOut, tokenAmount, 0, 0, 0, 0);
    }
}

contract FixtureFactory {
    address constant MARKET = 0x7fe4ABD28046F31FF4961932756Be3AE3a003903;

    event Launched(address indexed token, address indexed creator, address indexed quote, string name, string symbol, string metadataURI, uint256 supply, uint16 creatorTaxBps);

    error FeeTooHigh();

    function launch(string calldata name, string calldata symbol, address quote, string calldata metadataURI, uint16 creatorTaxBps) external returns (address token) {
        if (creatorTaxBps > 1000) revert FeeTooHigh();
        token = address(new FixtureToken(name, symbol, MARKET));
        emit Launched(token, msg.sender, quote, name, symbol, metadataURI, 1_000_000_000 ether, creatorTaxBps);
    }
}
